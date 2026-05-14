import { useEffect, useRef } from 'react';

// Calls `callback` (debounced) whenever the server broadcasts an update event.
// EventSource reconnects automatically on drop — no manual retry needed.
export const useSSE = (callback, debounceMs = 300) => {
    const timerRef    = useRef(null);
    const callbackRef = useRef(callback);
    callbackRef.current = callback;

    useEffect(() => {
        const debounced = () => {
            clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => callbackRef.current(), debounceMs);
        };

        const es = new EventSource('/api/events', { withCredentials: true });
        es.addEventListener('update', debounced);
        es.onerror = () => {};

        return () => {
            es.close();
            clearTimeout(timerRef.current);
        };
    }, [debounceMs]);
};
