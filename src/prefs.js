// Small localStorage helpers. Everything is wrapped so private modes never crash the app.
const get = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : { ...fallback };
  } catch {
    return { ...fallback };
  }
};
const set = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
};

export const defaultAppearance = { theme: 'system', accent: 'violet', style: 'bubbles', size: 'm' };
export const loadAppearance = () => {
  const a = get('parley:appearance', defaultAppearance);
  try {
    // migrate the old theme-only key
    const old = localStorage.getItem('parley:theme');
    if (old && !localStorage.getItem('parley:appearance')) a.theme = old;
  } catch {}
  return a;
};
export const saveAppearance = (a) => set('parley:appearance', a);

export const applyAppearance = (a) => {
  const root = document.documentElement;
  if (a.theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', a.theme);
  root.dataset.accent = a.accent;
  root.dataset.style = a.style;
  root.dataset.size = a.size;
};

// Starred and muted conversations are remembered per person on this browser.
const convKey = (meId) => `parley:conv:${meId}`;
export const loadConvPrefs = (meId) => {
  const p = get(convKey(meId), { starred: [], muted: [] });
  return { starred: p.starred || [], muted: p.muted || [] };
};
export const saveConvPrefs = (meId, p) => set(convKey(meId), p);

// Read markers: conversation id -> timestamp of the newest message you have seen.
const readKey = (meId) => `parley:read:${meId}`;
export const loadReadMap = (meId) => get(readKey(meId), {});
export const saveReadMap = (meId, map) => set(readKey(meId), map);

// Unsent drafts, per person and conversation (kept in memory for the session + localStorage).
const draftKey = (meId) => `parley:drafts:${meId}`;
export const loadDrafts = (meId) => get(draftKey(meId), {});
export const saveDraft = (meId, conv, text) => {
  const all = loadDrafts(meId);
  if (text) all[conv] = text;
  else delete all[conv];
  set(draftKey(meId), all);
};
