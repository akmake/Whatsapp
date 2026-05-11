import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Circle,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { busApi } from '../services/busApi';

const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});
L.Marker.prototype.options.icon = DefaultIcon;

// אייקון אדום - המיקום שלי לפי GPS
const userIcon = L.icon({
  iconUrl:
    'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

// אייקון ירוק - מיקום שנבחר ידנית בלחיצה כפולה
const pickedIcon = L.icon({
  iconUrl:
    'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

const FALLBACK_LOCATION = [32.0853, 34.7818];

const escapeHtml = (value = '') =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const buildRouteMarkerIcon = (routeNumber) => {
  const label = escapeHtml(routeNumber || '?');

  return L.divIcon({
    className: 'route-bus-marker-wrap',
    html: `<div class="route-bus-marker">${label}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -16],
  });
};

// רכיב פנימי שדואג להזיז את המפה למרכז החדש
const MapCenterer = ({ center, zoom }) => {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView(center, zoom ?? map.getZoom());
  }, [center, zoom, map]);
  return null;
};

// תופס דאבל-קליק על המפה ומעדכן את מרכז החיפוש
const MapDoubleClickHandler = ({ onPick }) => {
  useMapEvents({
    dblclick: (e) => {
      onPick([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
};

const BusPage = () => {
  // gpsLocation = המיקום מה-GPS של הדפדפן (אדום)
  // pickedLocation = מיקום שהמשתמש בחר ידנית בלחיצה כפולה (ירוק)
  // searchCenter = הנקודה שלפיה נטענות התחנות (pickedLocation אם קיים, אחרת gpsLocation)
  const [gpsLocation, setGpsLocation] = useState(null);
  const [gpsAccuracy, setGpsAccuracy] = useState(null);
  const [pickedLocation, setPickedLocation] = useState(null);
  const [locationStatus, setLocationStatus] = useState('locating'); // locating | found | denied | unavailable
  const [stops, setStops] = useState([]);
  const [selectedStopCode, setSelectedStopCode] = useState(null);
  const [selectedRouteNumber, setSelectedRouteNumber] = useState(null);
  const [selectedStopArrivals, setSelectedStopArrivals] = useState([]);
  const [liveVehicles, setLiveVehicles] = useState([]);
  const [loadingStops, setLoadingStops] = useState(true);
  const [loadingStopDetails, setLoadingStopDetails] = useState(false);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [pageError, setPageError] = useState('');

  // נמנע ממירוצים בין בקשות מקבילות לתחנות
  const stopsRequestRef = useRef(0);

  const searchCenter = useMemo(
    () => pickedLocation || gpsLocation || FALLBACK_LOCATION,
    [pickedLocation, gpsLocation]
  );

  const fetchNearbyStops = useCallback(async (lat, lon) => {
    const requestId = ++stopsRequestRef.current;
    try {
      setLoadingStops(true);
      setPageError('');
      const res = await busApi.getNearby(lat, lon, 10000);
      // מתעלמים מתשובה ישנה אם בינתיים יצאה בקשה חדשה
      if (requestId !== stopsRequestRef.current) return;
      setStops(res.data?.stops || []);
    } catch (error) {
      if (requestId !== stopsRequestRef.current) return;
      console.error('Failed to fetch stops', error);
      setStops([]);
      setPageError('לא הצלחנו לטעון תחנות כרגע. בדוק שהשרת רץ ונסה שוב.');
    } finally {
      if (requestId === stopsRequestRef.current) setLoadingStops(false);
    }
  }, []);

  const fetchStopDetails = useCallback(async (stopCode, options = {}) => {
    const { routeNumber = null, showLoader = true } = options;

    try {
      if (showLoader) setLoadingStopDetails(true);
      setPageError('');
      const [arrivalsRes, liveRes] = await Promise.all([
        busApi.getArrivals(stopCode),
        busApi.getLiveVehicles(stopCode, routeNumber),
      ]);

      setSelectedStopArrivals(arrivalsRes.data?.arrivals || []);
      setLiveVehicles(liveRes.data?.vehicles || []);
      setAutoRefreshEnabled(true);
    } catch (error) {
      console.error('Failed to fetch stop detailed data', error);
      setSelectedStopArrivals([]);
      setLiveVehicles([]);
      setAutoRefreshEnabled(false);
      setPageError('אין תקשורת לשרת כרגע (ECONNREFUSED). הפעל את השרת המקומי על פורט 5000.');
    } finally {
      if (showLoader) setLoadingStopDetails(false);
    }
  }, []);

  // מאתר את המיקום ע"י watchPosition - תופס שיפורי דיוק שמגיעים אחרי הקריאה הראשונה
  const startGeolocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setLocationStatus('unavailable');
      // טוען עם FALLBACK ועדיין מציג תחנות
      fetchNearbyStops(FALLBACK_LOCATION[0], FALLBACK_LOCATION[1]);
      return null;
    }

    setLocationStatus('locating');

    let resolvedOnce = false;
    const watchId = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const next = [coords.latitude, coords.longitude];
        setGpsLocation(next);
        setGpsAccuracy(coords.accuracy || null);
        setLocationStatus('found');
        // נטען תחנות רק בפעם הראשונה שיש לנו מיקום (אלא אם המשתמש לא בחר נקודה ידנית)
        if (!resolvedOnce) {
          resolvedOnce = true;
          // נטען רק אם המשתמש לא בחר נקודה ידנית בינתיים
          setPickedLocation((current) => {
            if (!current) {
              fetchNearbyStops(next[0], next[1]);
            }
            return current;
          });
        }
      },
      (err) => {
        console.warn('Geolocation error:', err?.message || err);
        if (!resolvedOnce) {
          resolvedOnce = true;
          setLocationStatus(err?.code === 1 ? 'denied' : 'unavailable');
          fetchNearbyStops(FALLBACK_LOCATION[0], FALLBACK_LOCATION[1]);
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );

    return watchId;
  }, [fetchNearbyStops]);

  useEffect(() => {
    const watchId = startGeolocation();
    return () => {
      if (watchId !== null && watchId !== undefined && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [startGeolocation]);

  useEffect(() => {
    if (!selectedStopCode || !autoRefreshEnabled) return;

    const interval = setInterval(() => {
      fetchStopDetails(selectedStopCode, {
        routeNumber: selectedRouteNumber,
        showLoader: false,
      });
    }, 10000);

    return () => clearInterval(interval);
  }, [fetchStopDetails, selectedStopCode, selectedRouteNumber, autoRefreshEnabled]);

  const handleStopClick = async (stopCode) => {
    setSelectedStopCode(stopCode);
    setSelectedRouteNumber(null);
    setLiveVehicles([]);
    setAutoRefreshEnabled(true);
    await fetchStopDetails(stopCode, { routeNumber: null });
  };

  const handleRouteClick = async (routeNumber) => {
    if (!selectedStopCode) return;
    setSelectedRouteNumber(routeNumber);
    await fetchStopDetails(selectedStopCode, { routeNumber });
  };

  const handleResetRouteFilter = async () => {
    if (!selectedStopCode) return;
    setSelectedRouteNumber(null);
    await fetchStopDetails(selectedStopCode, { routeNumber: null });
  };

  // המשתמש לחץ פעמיים על נקודה במפה - זה יהפוך למרכז החיפוש החדש
  const handlePickLocation = useCallback(
    (point) => {
      setPickedLocation(point);
      setSelectedStopCode(null);
      setSelectedStopArrivals([]);
      setLiveVehicles([]);
      fetchNearbyStops(point[0], point[1]);
    },
    [fetchNearbyStops]
  );

  const handleResetToGps = () => {
    setPickedLocation(null);
    if (gpsLocation) {
      fetchNearbyStops(gpsLocation[0], gpsLocation[1]);
    }
  };

  const handleRetryGps = () => {
    startGeolocation();
  };

  if (locationStatus === 'locating' && stops.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center text-xl font-semibold">
        מאתר את המיקום שלך...
      </div>
    );
  }

  const accuracyText =
    gpsAccuracy != null
      ? `דיוק GPS: ±${Math.round(gpsAccuracy)} מ'`
      : '';

  const usingPicked = !!pickedLocation;

  return (
    <div className="h-[calc(100vh-6rem)] w-full flex flex-col mt-24">
      <div className="p-4 bg-blue-600 text-white shadow-md z-10 relative">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold">מפת אוטובוסים בזמן אמת</h1>
            <p className="text-sm">
              מוצגות {stops.length} תחנות בטווח 10 ק"מ
              {usingPicked
                ? ' מהנקודה שבחרת במפה'
                : gpsLocation
                ? ' מהמיקום שלך'
                : ' מנקודת ברירת מחדל'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`text-xs px-2 py-1 rounded ${
                locationStatus === 'found'
                  ? 'bg-emerald-700/70'
                  : locationStatus === 'locating'
                  ? 'bg-yellow-600/70'
                  : 'bg-red-600/80'
              }`}
            >
              {locationStatus === 'found' && (gpsAccuracy ? accuracyText : 'אותר מיקום')}
              {locationStatus === 'locating' && 'מאתר מיקום...'}
              {locationStatus === 'denied' && 'אין הרשאת מיקום'}
              {locationStatus === 'unavailable' && 'GPS לא זמין'}
            </span>

            <button
              type="button"
              onClick={handleRetryGps}
              className="text-xs bg-white/20 hover:bg-white/30 px-2 py-1 rounded"
              title="נסה לאתר את המיקום שוב"
            >
              🔄 רענן מיקום
            </button>

            {usingPicked && (
              <button
                type="button"
                onClick={handleResetToGps}
                className="text-xs bg-emerald-700/80 hover:bg-emerald-700 px-2 py-1 rounded"
                title="חזור למיקום שלי לפי GPS"
              >
                חזרה למיקום שלי
              </button>
            )}
          </div>
        </div>

        <p className="text-[11px] mt-2 opacity-90">
          💡 טיפ: לחיצה כפולה על כל נקודה במפה תקבע אותה כמרכז החיפוש לתחנות
        </p>

        {selectedRouteNumber && (
          <p className="text-xs mt-2 bg-blue-700 inline-block px-2 py-1 rounded">
            סינון פעיל: קו {selectedRouteNumber}
          </p>
        )}
        {pageError && (
          <p className="text-xs mt-2 bg-red-500/80 inline-block px-2 py-1 rounded">{pageError}</p>
        )}
        {loadingStops && (
          <p className="text-xs mt-2 bg-blue-700 inline-block px-2 py-1 rounded">
            טוען תחנות...
          </p>
        )}
      </div>

      <div className="flex-1 w-full relative z-0">
        <MapContainer
          center={searchCenter}
          zoom={14}
          className="h-full w-full"
          doubleClickZoom={false} // מבטלים זום ב-double-click כדי שזה יזין את ה-onPick שלנו
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap contributors"
          />
          <MapCenterer center={searchCenter} zoom={14} />
          <MapDoubleClickHandler onPick={handlePickLocation} />

          {/* עיגול דיוק GPS */}
          {gpsLocation && gpsAccuracy && (
            <Circle
              center={gpsLocation}
              radius={gpsAccuracy}
              pathOptions={{ color: '#2563eb', fillColor: '#3b82f6', fillOpacity: 0.12 }}
            />
          )}

          {/* סמן ה-GPS האמיתי שלי (אדום) */}
          {gpsLocation && (
            <Marker position={gpsLocation} icon={userIcon}>
              <Popup>
                <div dir="rtl" className="text-right">
                  <strong>אתה נמצא כאן</strong>
                  {gpsAccuracy && (
                    <p className="text-xs text-gray-600 mt-1">{accuracyText}</p>
                  )}
                </div>
              </Popup>
            </Marker>
          )}

          {/* סמן הנקודה שבחרתי ידנית (ירוק) */}
          {pickedLocation && (
            <Marker position={pickedLocation} icon={pickedIcon}>
              <Popup>
                <div dir="rtl" className="text-right">
                  <strong>נקודת חיפוש שבחרת</strong>
                  <p className="text-xs text-gray-600 mt-1">
                    דאבל-קליק על נקודה אחרת כדי להזיז
                  </p>
                </div>
              </Popup>
            </Marker>
          )}

          {stops.map((stop) => {
            const isSelectedStop = selectedStopCode === stop.code;
            return (
              <Marker
                key={`stop-${stop.code}`}
                position={[stop.lat, stop.lon]}
                eventHandlers={{ click: () => handleStopClick(stop.code) }}
              >
                <Popup className="w-72">
                  <div className="text-right" dir="rtl">
                    <h3 className="font-bold text-lg border-b pb-1 mb-2">{stop.name}</h3>
                    <p className="text-sm text-gray-600 mb-2">מספר תחנה: {stop.code}</p>

                    {!isSelectedStop && (
                      <p className="text-sm italic text-gray-500">
                        לחץ על התחנה כדי לטעון זמני הגעה
                      </p>
                    )}

                    {isSelectedStop && (
                      <div className="max-h-40 overflow-y-auto">
                        <h4 className="font-semibold mb-1">זמני הגעה קרובים:</h4>
                        {loadingStopDetails && <p className="text-sm italic">טוען נתונים...</p>}
                        {!loadingStopDetails && selectedStopArrivals.length === 0 && (
                          <p className="text-sm italic">אין כרגע אוטובוסים קרובים לתחנה זו</p>
                        )}

                        {!loadingStopDetails && selectedRouteNumber && (
                          <button
                            type="button"
                            onClick={handleResetRouteFilter}
                            className="text-xs mb-2 bg-slate-700 text-white px-2 py-1 rounded"
                          >
                            הצג את כל הקווים בתחנה
                          </button>
                        )}

                        {!loadingStopDetails && selectedStopArrivals.length > 0 && (
                          <ul className="space-y-2">
                            {selectedStopArrivals.slice(0, 10).map((arrival, idx) => {
                              const scheduledTime = new Date(arrival.arrivalTime);
                              const scheduledClock = scheduledTime.toLocaleTimeString('he-IL', {
                                hour: '2-digit',
                                minute: '2-digit',
                              });
                              const routeNumber = String(arrival.routeNumber || '').trim();
                              const isRouteSelected = selectedRouteNumber === routeNumber;

                              // אם יש מיקום חי לאוטובוס - נציג ETA אמיתי
                              const liveEta = arrival.liveEtaMinutes;
                              const hasLive = arrival.hasLiveData;

                              // ETA ע"פ זמן מתוזמן (כש"אין נתונים חיים")
                              const scheduledMinutesFromNow = Math.round(
                                (scheduledTime.getTime() - Date.now()) / 60000
                              );

                              const etaMinutes =
                                hasLive && liveEta != null ? liveEta : scheduledMinutesFromNow;

                              // טקסט תצוגה ראשי - "עוד X דקות" / "כעת" / "עזב"
                              let etaLabel;
                              if (etaMinutes <= 0) {
                                etaLabel = hasLive ? 'בתחנה כעת' : 'עזב/בתחנה';
                              } else if (etaMinutes === 1) {
                                etaLabel = 'עוד דקה';
                              } else if (etaMinutes < 60) {
                                etaLabel = `עוד ${etaMinutes} דק'`;
                              } else {
                                const hours = Math.floor(etaMinutes / 60);
                                const mins = etaMinutes % 60;
                                etaLabel = mins
                                  ? `עוד ${hours} שע' ו-${mins} דק'`
                                  : `עוד ${hours} שע'`;
                              }

                              return (
                                <li key={`arr-${idx}`}>
                                  <button
                                    type="button"
                                    disabled={!routeNumber}
                                    onClick={() => routeNumber && handleRouteClick(routeNumber)}
                                    className={`w-full text-right bg-gray-50 p-2 rounded border transition ${
                                      isRouteSelected
                                        ? 'border-blue-600 bg-blue-50'
                                        : 'border-gray-200 hover:border-gray-300'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="font-bold text-blue-600 text-base">
                                        קו {routeNumber || '-'}
                                      </span>
                                      <div className="flex items-center gap-1.5">
                                        {hasLive && (
                                          <span
                                            className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"
                                            title="מידע חי - הזמן מחושב מהמיקום העכשווי של האוטובוס"
                                          />
                                        )}
                                        <span
                                          className={`font-bold ${
                                            etaMinutes <= 5 && etaMinutes > 0
                                              ? 'text-emerald-700'
                                              : 'text-slate-800'
                                          }`}
                                        >
                                          {etaLabel}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex items-center justify-between mt-0.5 text-xs text-gray-600">
                                      <span className="truncate">
                                        לכיוון: {arrival.routeName || 'יעד לא זמין'}
                                      </span>
                                      <span className="text-gray-500 shrink-0">
                                        {hasLive ? 'מתוזמן ' : ''}({scheduledClock})
                                      </span>
                                    </div>
                                    {hasLive && arrival.liveDistanceMeters != null && (
                                      <div className="text-[11px] text-emerald-700 mt-0.5">
                                        🚌 האוטובוס {Math.round(arrival.liveDistanceMeters)} מ' מהתחנה
                                        {arrival.liveVelocity != null
                                          ? ` · ${arrival.liveVelocity} קמ"ש`
                                          : ''}
                                      </div>
                                    )}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {liveVehicles.map((vehicle, idx) => (
            <Marker
              key={`bus-${vehicle.rideId || idx}-${vehicle.routeNumber || 'route'}`}
              position={[vehicle.lat, vehicle.lon]}
              icon={buildRouteMarkerIcon(vehicle.routeNumber)}
            >
              <Popup>
                <div className="text-right" dir="rtl">
                  <strong className="text-blue-600 border-b block pb-1 mb-1">
                    אוטובוס בזמן אמת
                  </strong>
                  <p className="text-sm">קו: {vehicle.routeNumber || vehicle.lineRef || '-'}</p>
                  <p className="text-sm">לכיוון: {vehicle.routeName || 'יעד לא זמין'}</p>
                  <p className="text-sm">רכב: {vehicle.vehicleRef ?? '-'}</p>
                  <p className="text-sm">מהירות: {vehicle.velocity ?? '-'} קמ"ש</p>
                  <p className="text-sm">
                    מרחק מהתחנה: {vehicle.distanceFromStopMeters ?? '-'} מ'
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    עודכן: {new Date(vehicle.recordedAt).toLocaleTimeString('he-IL')}
                  </p>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
};

export default BusPage;
"
                                            title="מידע חי - הזמן מחושב מהמיקום העכשווי של האוטובוס"
                                          />
                                        )}
                                        <span
                                          className={`font-bold ${
                                            etaMinutes <= 5 && etaMinutes > 0
                                              ? 'text-emerald-700'
                                              : 'text-slate-800'
                                          }`}
                                        >
                                          {etaLabel}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex items-center justify-between mt-0.5 text-xs text-gray-600">
                                      <span className="truncate">
                                        לכיוון: {arrival.routeName || 'יעד לא זמין'}
                                      </span>
                                      <span className="text-gray-500 shrink-0">
                                        {hasLive ? 'מתוזמן ' : ''}({scheduledClock})
                                      </span>
                                    </div>
                                    {hasLive && arrival.liveDistanceMeters != null && (
                                      <div className="text-[11px] text-emerald-700 mt-0.5">
                                        🚌 האוטובוס {Math.round(arrival.liveDistanceMeters)} מ' מהתחנה
                                        {arrival.liveVelocity != null
                                          ? ` · ${arrival.liveVelocity} קמ"ש`
                                          : ''}
                                      </div>
                                    )}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {liveVehicles.map((vehicle, idx) => (
            <Marker
              key={`bus-${vehicle.rideId || idx}-${vehicle.routeNumber || 'route'}`}
              position={[vehicle.lat, vehicle.lon]}
              icon={buildRouteMarkerIcon(vehicle.routeNumber)}
            >
              <Popup>
                <div className="text-right" dir="rtl">
                  <strong className="text-blue-600 border-b block pb-1 mb-1">
                    אוטובוס בזמן אמת
                  </strong>
                  <p className="text-sm">קו: {vehicle.routeNumber || vehicle.lineRef || '-'}</p>
                  <p className="text-sm">לכיוון: {vehicle.routeName || 'יעד לא זמין'}</p>
                  <p className="text-sm">רכב: {vehicle.vehicleRef ?? '-'}</p>
                  <p className="text-sm">מהירות: {vehicle.velocity ?? '-'} קמ"ש</p>
                  <p className="text-sm">
                    מרחק מהתחנה: {vehicle.distanceFromStopMeters ?? '-'} מ'
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    עודכן: {new Date(vehicle.recordedAt).toLocaleTimeString('he-IL')}
                  </p>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
};

export default BusPage;
