import React from 'react';

export default function AccessibilityPage() {
  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <h1 className="text-3xl font-bold text-slate-900 mb-8 border-b border-gray-200 pb-4">הצהרת נגישות</h1>
      
      <div className="space-y-6 text-slate-700 leading-relaxed">
        <p className="font-medium">
          CityLine Systems רואה חשיבות עליונה במתן שירות שוויוני לכלל הלקוחות והגולשים ובשיפור הנגישות באתר האינטרנט שלה לאנשים עם מוגבלות.
        </p>

        <section>
          <h2 className="text-xl font-bold text-slate-800 mb-2">תקינה</h2>
          <p>
            האתר נבנה בהתאם להוראות נגישות תכנים באינטרנט WCAG 2.1 ברמה AA, ובהתאם לתקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות), תשע"ג-2013.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-800 mb-2">אמצעי הנגישות באתר</h2>
          <ul className="list-disc list-inside space-y-1 mr-4">
            <li>ניווט פשוט וברור באמצעות המקלדת.</li>
            <li>שימוש בצבעים בעלי ניגודיות גבוהה (כהה על גבי בהיר).</li>
            <li>התאמה לכל סוגי הדפדפנים המודרניים ולמכשירים ניידים.</li>
            <li>טפסים נגישים עם תוויות ברורות.</li>
            <li>אפשרות להגדלת הטקסט באמצעות הדפדפן.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-800 mb-2">סייג לנגישות</h2>
          <p>
            למרות מאמצנו להנגיש את כלל הדפים באתר, ייתכן ויתגלו חלקים שטרם הונגשו במלואם. 
            אנו ממשיכים במאמצים לשפר את נגישות האתר כחלק ממחויבותנו לאפשר שימוש בו עבור כלל האוכלוסייה.
          </p>
        </section>

        <section className="bg-slate-50 p-6 rounded-lg border border-slate-200">
          <h2 className="text-xl font-bold text-slate-800 mb-2">פרטי רכז נגישות</h2>
          <p>אם נתקלתם בבעיה או שיש לכם הצעה לשיפור, נשמח לשמוע מכם:</p>
          <div className="mt-2 space-y-1">
            <p><strong>שם:</strong> מוקד השירות</p>
            <p><strong>טלפון:</strong> *2055</p>
            <p><strong>אימייל:</strong> accessibility@cityline.co.il</p>
          </div>
        </section>
      </div>
    </div>
  );
}