export default function MetricCard({ label, value, icon, color, bg }) {
    return (
        <div className={`${bg} rounded-xl p-4 shadow-sm`}>
            <div className="flex items-start justify-between mb-1">
                <span className="text-base leading-none">{icon}</span>
                <p className="text-xs text-[#8696a0] text-right">{label}</p>
            </div>
            <p className={`text-3xl font-black text-right ${color}`}>{value ?? '—'}</p>
        </div>
    );
}
