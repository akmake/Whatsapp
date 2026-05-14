import { Component } from 'react';

export default class ErrorBoundary extends Component {
    state = { error: null };

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        console.error('[ErrorBoundary]', error.message, info.componentStack);
    }

    render() {
        if (this.state.error) {
            return (
                <div className="flex items-center justify-center h-full bg-[#eae6df]">
                    <div className="bg-white rounded-xl shadow-sm p-8 text-center max-w-sm">
                        <div className="text-4xl mb-3">⚠️</div>
                        <p className="text-[#111b21] font-semibold mb-1">שגיאה בטעינת הדף</p>
                        <p className="text-[#8696a0] text-sm mb-5 font-mono">{this.state.error.message}</p>
                        <button
                            onClick={() => this.setState({ error: null })}
                            className="bg-[#25D366] text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-[#1fb954] transition">
                            נסה שוב
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}
