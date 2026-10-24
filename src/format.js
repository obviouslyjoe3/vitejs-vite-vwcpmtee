// Time display that follows the "Time format" setting (stored on <html data-clock>).
const cycle = () => {
  const c = document.documentElement.dataset.clock;
  return c === '12' ? { hourCycle: 'h12' } : c === '24' ? { hourCycle: 'h23' } : {};
};

export const fmtClock = (ts, timeZone) =>
  new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', ...cycle(), ...(timeZone ? { timeZone } : {}) });

export const fmtStamp = (ts) =>
  new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', ...cycle() });

export const reducedMotion = () =>
  document.documentElement.dataset.motion === 'reduced' ||
  (document.documentElement.dataset.motion !== 'full' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

// "just now", "5 min ago", "3 h ago", "2 d ago"
export const ago = (ts) => {
  const m = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
};

export const fmtMonth = (ts) => new Date(ts).toLocaleDateString([], { month: 'short', year: 'numeric' });
