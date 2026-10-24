// Reactions you used lately, newest first. Kept per browser.
const KEY = 'parley:recent-reactions';
const MAX = 6;

export const loadRecents = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(raw) ? raw.filter((x) => typeof x === 'string').slice(0, MAX) : [];
  } catch {
    return [];
  }
};

export const pushRecent = (emoji) => {
  try {
    const next = [emoji, ...loadRecents().filter((x) => x !== emoji)].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
};
