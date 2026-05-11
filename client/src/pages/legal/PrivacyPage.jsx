import React from 'react';

export default function PrivacyPage() {
  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <h1 className="text-3xl font-bold text-slate-900 mb-8 border-b border-gray-200 pb-4">מדיניות פרטיות</h1>
      
      <div className="space-y-6 text-slate-700 leading-relaxed">
        <section>
          <h2 className="text-xl font-bold text-slate-800 mb-2">1. איסוף מידע</h2>
          <p>
            בעת השארת פרטים באתר (בטופס "צור קשר" או "קבלת הצעה"), אנו אוספים את המידע שסיפקת מרצונך: 
            שם מלא, מספר טלפון וכתובת אימייל.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-800 mb-2">2. שימוש במידע</h2>
          <p>
            המידע שנאסף ישמש אך ורק למטרת יצירת קשר עמך לצורך מתן פרטים על שירותינו, תיאום פגישה או מתן הצעת מחיר.
            אנו מתחייבים לא להעביר את פרטיך לצד שלישי ללא הסכמתך, למעט במקרים המחויבים על פי חוק.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-800 mb-2">3. אבטחת מידע</h2>
          <p>
            אנו נוקטים באמצעי זהירות מקובלים על מנת לשמור, ככל האפשר, על סודיות המידע. 
            עם זאת, במקרים שאינם בשליטתנו ו/או הנובעים מכוח עליון, החברה לא תהא אחראית לכל נזק מכל סוג שהוא.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-800 mb-2">4. יצירת קשר</h2>
          <p>
            לכל שאלה בנושא פרטיות, ניתן לפנות אלינו באמצעות הטופס באתר או במוקד הטלפוני.
          </p>
        </section>
      </div>
    </div>
  );
}