export const WA_STATUS = {
    connected:    { text: 'מחובר',        dot: 'bg-[#25D366]' },
    connecting:   { text: 'מתחבר...',      dot: 'bg-yellow-400' },
    waiting_qr:   { text: 'ממתין לסריקה', dot: 'bg-blue-500'  },
    disconnected: { text: 'מנותק',         dot: 'bg-red-500'   },
};

export const BRIDGE_STATUS = {
    active:       { text: 'מחובר',    dot: 'bg-[#25D366]', color: 'text-green-600' },
    inactive:     { text: 'לא מוגדר', dot: 'bg-gray-300',  color: 'text-gray-400'  },
    disconnected: { text: 'מנותק',    dot: 'bg-red-500',   color: 'text-red-500'   },
};
