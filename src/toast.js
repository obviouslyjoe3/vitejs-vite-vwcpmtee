// Tiny event bus for toasts and confetti, so any component can call toast('Saved') without prop drilling.
export const toast = (text, kind = 'info') =>
  window.dispatchEvent(new CustomEvent('parley:toast', { detail: { text, kind, id: Math.random().toString(36).slice(2) } }));

export const confetti = () => window.dispatchEvent(new CustomEvent('parley:confetti'));
