import { useNavigate } from 'react-router-dom';
import { SERVICE_LIST } from '@/config/services';

function ServiceCard({ service, onSelect }) {
    const { name, title, desc, color, accent, active } = service;
    return (
        <button
            onClick={() => active && onSelect(service)}
            disabled={!active}
            className={`group relative text-right rounded-2xl border bg-white p-7 transition shadow-sm
                ${active
                    ? 'border-gray-200 hover:shadow-lg hover:-translate-y-0.5 cursor-pointer'
                    : 'border-gray-100 opacity-70 cursor-not-allowed'}`}
        >
            {!active && (
                <span className="absolute top-4 left-4 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">
                    בקרוב
                </span>
            )}

            <div className="w-14 h-14 rounded-xl flex items-center justify-center font-black text-white text-xl mb-5"
                style={{ backgroundColor: color }}>
                <span style={{ color: accent }}>{name.slice(0, 1)}</span>{name.slice(1)}
            </div>

            <h3 className="text-lg font-bold text-[#111b21] mb-1">{name}</h3>
            <p className="text-sm font-medium text-[#8696a0] mb-3">{title}</p>
            <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>

            {active && (
                <div className="mt-5 flex items-center gap-1.5 text-sm font-semibold transition group-hover:gap-2.5"
                    style={{ color }}>
                    כניסה
                    <svg className="w-4 h-4 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                </div>
            )}
        </button>
    );
}

export default function ServicesPage() {
    const navigate = useNavigate();

    return (
        <div className="h-full overflow-auto bg-gray-50">
            <div className="max-w-4xl mx-auto px-6 py-14">
                <div className="mb-10">
                    <h1 className="text-2xl font-bold text-[#111b21] mb-2">בחר שירות</h1>
                    <p className="text-sm text-gray-500">בחר את השירות שברצונך לנהל. אפשר להחליף שירות בכל רגע מהתפריט העליון.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    {SERVICE_LIST.map((s) => (
                        <ServiceCard key={s.id} service={s} onSelect={(svc) => navigate(svc.path)} />
                    ))}
                </div>
            </div>
        </div>
    );
}
