import React from 'react';

export default function TermsPage() {
  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <h1 className="text-3xl font-bold text-slate-900 mb-8 border-b border-gray-200 pb-4">תנאי שימוש</h1>
      
      <div className="space-y-6 text-slate-700 leading-relaxed">
        <section>
          <h2 className="text-xl font-bold text-slate-800 mb-2">1. כללי</h2>
          <p>
            ברוכים הבאים לאתר CityLine Systems (להלן: "האתר"). השימוש באתר כפוף לתנאים המפורטים להלן. 
            גלישה באתר ושימוש בשירותיו מהווים הסכמה מצדך לתנאים אלו.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-800 mb-2">2. השירותים באתר</h2>
          <p>
            האתר מספק מידע אודות שירותי ההסעות והפתרונות הלוגיסטיים של החברה ומאפשר יצירת קשר לקבלת הצעות מחיר.
            התמונות באתר הן להמחשה בלבד.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-800 mb-2">3. קניין רוחני</h2>
          <p>
            כל זכויות היוצרים והקניין הרוחני באתר, לרבות השם, העיצוב, התכנים, הקוד והקבצים הגרפיים, הינם רכושה הבלעדי של CityLine Systems
            אין להעתיק, להפיץ, להציג בפומבי או למסור לצד שלישי כל חלק מהנ"ל ללא קבלת הסכמה בכתב ומראש מהחברה.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-800 mb-2">4. הגבלת אחריות</h2>
          <p>
            החברה עושה מאמץ לשמור על תקינות האתר, אך אינה מתחייבת שהשירות יהיה חסין מפני תקלות. 
            החברה לא תישא באחריות לכל נזק, ישיר או עקיף, שייגרם למשתמש כתוצאה משימוש באתר.
          </p>
        </section>
      </div>
    </div>
  );
}