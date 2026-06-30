// קטלוג השירותים של המערכת.
// כל שירות הוא "אפליקציה" עצמאית עם הניווט שלה. מסך הבחירה והנאבבר נבנים מכאן.

export const SERVICES = {
    wtm: {
        id: 'wtm',
        name: 'WTM',
        title: 'WhatsApp ⇄ Mail',
        desc: 'גשר דו-כיווני בין וואטסאפ למייל — האזנה להודעות והעברה אוטומטית בשני הכיוונים.',
        path: '/wtm',
        color: '#075E54',
        accent: '#25D366',
        active: true,
        nav: [
            { to: '/wtm', label: 'לקוחות', end: true },
            { to: '/wtm/monitor', label: 'ניטור' },
            { to: '/wtm/logs', label: 'לוגים' },
        ],
    },
    btb: {
        id: 'btb',
        name: 'BTB',
        title: 'Business Statuses',
        desc: 'שירות לבעלי עסקים בדגש על אזור הסטטוסים. מתחבר לוואטסאפ באותה שיטה — לוגיקה ייעודית.',
        path: '/btb',
        color: '#1F3A5F',
        accent: '#3B82F6',
        active: true,
        nav: [
            { to: '/btb', label: 'סטטוסים', end: true },
        ],
    },
};

export const SERVICE_LIST = Object.values(SERVICES);

// מזהה את השירות הפעיל לפי ה-pathname הנוכחי (למשל "/wtm/logs" -> wtm).
export function serviceFromPath(pathname) {
    return SERVICE_LIST.find((s) => pathname === s.path || pathname.startsWith(s.path + '/')) || null;
}
