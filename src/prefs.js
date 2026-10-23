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

// Saved messages ("save for later"): snapshots kept per person on this browser.
const savedKey = (meId) => `parley:saved:${meId}`;
export const loadSaved = (meId) => {
  try {
    const raw = JSON.parse(localStorage.getItem(savedKey(meId)));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
};
export const saveSaved = (meId, list) => set(savedKey(meId), list);

// One-time cleanup after the move to real accounts: everything this browser remembered
// about the old name-only identities (read markers, drafts, saved messages, stars) belongs
// to accounts that no longer exist. Appearance and alert settings are kept.
const SCHEMA_KEY = 'parley:schema';
const SCHEMA = '2';
export const purgeLegacyData = () => {
  try {
    if (localStorage.getItem(SCHEMA_KEY) === SCHEMA) return;
    const keep = new Set(['parley:appearance', 'parley:prefs', 'parley:theme', SCHEMA_KEY]);
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('parley:') && !keep.has(key)) localStorage.removeItem(key);
    }
    sessionStorage.removeItem('parley:session');
    sessionStorage.removeItem('parley:active');
    localStorage.setItem(SCHEMA_KEY, SCHEMA);
  } catch {}
};
