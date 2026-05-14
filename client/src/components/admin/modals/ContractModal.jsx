import { useEffect, useRef } from 'react';

export default function ContractModal({ onClose }) {
    const iframeRef = useRef(null);

    // סגירה ב-Escape
    useEffect(() => {
        const handle = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handle);
        return () => document.removeEventListener('keydown', handle);
    }, [onClose]);

    const handlePrint = () => {
        const win = iframeRef.current?.contentWindow;
        if (win) { win.focus(); win.print(); }
    };

    const handleDownloadPdf = () => {
        const w = window.open('/contract.html', '_blank');
        if (!w) return;
        w.addEventListener('load', () => {
            w.focus();
            w.print();
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ direction: 'rtl' }}>
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

            {/* Panel */}
            <div className="relative z-10 flex flex-col m-4 md:m-8 rounded-2xl overflow-hidden shadow-2xl bg-white flex-1 min-h-0">

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3.5 bg-white border-b border-slate-200 flex-shrink-0">
                    <div className="flex items-center gap-2">
                        {/* Close */}
                        <button onClick={onClose}
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Print */}
                        <button onClick={handlePrint}
                            className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3.5 py-2 rounded-lg transition">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                            </svg>
                            הדפס
                        </button>

                        {/* Download PDF */}
                        <button onClick={handleDownloadPdf}
                            className="flex items-center gap-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-3.5 py-2 rounded-lg transition shadow-sm">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                            </svg>
                            הורד PDF
                        </button>
                    </div>

                    {/* Title center */}
                    <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 pointer-events-none">
                        <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span className="text-sm font-semibold text-slate-700">הסכם שירות — גרסת בטא</span>
                    </div>
                </div>

                {/* iframe */}
                <div className="flex-1 bg-slate-100 overflow-hidden">
                    <iframe
                        ref={iframeRef}
                        src="/contract.html"
                        className="w-full h-full border-0"
                        title="הסכם שירות"
                    />
                </div>
            </div>
        </div>
    );
}
