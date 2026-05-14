export default function WaBtn({ onClick, children, green, red, yellow }) {
    const c = green  ? 'bg-[#dcf8c6] text-[#075E54] hover:bg-[#c8f0a8]'
            : red    ? 'bg-red-50 text-red-600 hover:bg-red-100'
            : yellow ? 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100'
            :          'bg-blue-50 text-blue-700 hover:bg-blue-100';
    return (
        <button onClick={onClick} className={`text-xs px-3 py-1.5 rounded-lg font-medium transition ${c}`}>
            {children}
        </button>
    );
}
