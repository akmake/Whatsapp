// Connected SSE response objects — one per open browser tab
const clients = new Set();

export const addSseClient = (res) => {
    res.writeHead(200, {
        'Content-Type':      'text/event-stream',
        'Cache-Control':     'no-cache, no-transform',
        'Connection':        'keep-alive',
        'X-Accel-Buffering': 'no', // disable nginx buffering
    });
    res.write(':\n\n'); // initial comment to flush headers
    clients.add(res);
    res.on('close', () => clients.delete(res));
};

export const broadcast = (event) => {
    if (clients.size === 0) return;
    const payload = `event: update\ndata: ${JSON.stringify({ event })}\n\n`;
    for (const res of [...clients]) {
        try { res.write(payload); } catch (e) { clients.delete(res); }
    }
};

// Keep connections alive — browsers close idle SSE after ~60s
setInterval(() => {
    for (const res of [...clients]) {
        try { res.write(':\n\n'); } catch (e) { clients.delete(res); }
    }
}, 25_000);
