// --- HELPERS PARTAGÉS ---

const HTML_ESCAPE_MAP = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
};

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch]);
}

function formatChrono(totalSeconds) {
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

function parseChronoToSeconds(value) {
    const [m, s] = String(value || '00:00').split(':').map((n) => parseInt(n, 10) || 0);
    return m * 60 + s;
}

function notifyError(title, error) {
    console.error(title, error);
    if (window.Swal) {
        Swal.fire('Erreur', error?.message || String(error), 'error');
    }
}
