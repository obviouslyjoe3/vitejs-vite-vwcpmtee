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
