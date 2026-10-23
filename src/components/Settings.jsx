import { useEffect, useState } from 'react';
import { COLORS, ACCENTS, STATUS_PRESETS } from '../constants.js';
import Emoji from '../Emoji.jsx';

const THEMES = [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']];
const STYLES = [['bubbles', 'Bubbles'], ['flat', 'Flat']];
const SIZES = [['s', 'Small'], ['m', 'Medium'], ['l', 'Large']];

function Segmented({ label, value, options, onChange }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

const browserTz = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
};
const zones = () => {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return [];
  }
};

function AccountSection({ me, onChangePassword, onLogout }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [note, setNote] = useState(null); // { ok, text }
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (next.length < 8) return setNote({ ok: false, text: 'Use at least 8 characters for the new password.' });
    if (next !== again) return setNote({ ok: false, text: 'The two new passwords do not match.' });
    setBusy(true);
    const res = await onChangePassword(current, next);
    setBusy(false);
    if (res.error) return setNote({ ok: false, text: res.error });
    setCurrent('');
    setNext('');
    setAgain('');
    setOpen(false);
    setNote({ ok: true, text: 'Password changed. Your other devices have been signed out.' });
  };

  return (
    <section>
      <h3>Account</h3>
      <p className="account-line">
        Signed in as <strong>{me.name}</strong>
      </p>
      <div className="inline-actions">
        <button className="chip" type="button" onClick={() => { setOpen((v) => !v); setNote(null); }} aria-expanded={open}>
          Change password
        </button>
        <button className="chip" type="button" onClick={onLogout}>Log out</button>
      </div>
      {open && (
        <form className="profile-form" onSubmit={submit}>
          <label className="field-label" htmlFor="pw-current">Current password</label>
          <input id="pw-current" type="password" className="field" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" maxLength={128} />
          <label className="field-label" htmlFor="pw-new">New password</label>
          <input id="pw-new" type="password" className="field" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" maxLength={128} placeholder="At least 8 characters" />
          <label className="field-label" htmlFor="pw-again">Repeat new password</label>
          <input id="pw-again" type="password" className="field" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" maxLength={128} />
          <div className="inline-actions">
            <button className="primary" type="submit" disabled={!current || !next || busy}>{busy ? 'Saving…' : 'Save password'}</button>
          </div>
        </form>
      )}
      {note && <p className={note.ok ? 'saved' : 'form-error'} role="status">{note.text}</p>}
    </section>
  );
}

export default function Settings({ me, appearance, prefs, onAppearance, onColor, onStatus, onProfile, onPrefs, onChangePassword, onLogout, onClose }) {
  const [emoji, setEmoji] = useState(me.status?.emoji || '');
  const [text, setText] = useState(me.status?.text || '');
  const [bio, setBio] = useState(me.bio || '');
  const [pronouns, setPronouns] = useState(me.pronouns || '');
  const [tz, setTz] = useState(me.tz || '');
  const [saved, setSaved] = useState(false);
  const zoneList = zones();
  const dirty = bio.trim() !== (me.bio || '') || pronouns.trim() !== (me.pronouns || '') || tz !== (me.tz || '');
  const saveProfile = (e) => {
    e.preventDefault();
    onProfile({ bio: bio.trim(), pronouns: pronouns.trim(), tz });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const denied = typeof Notification !== 'undefined' && Notification.permission === 'denied';
  const set = (patch) => onAppearance({ ...appearance, ...patch });
  const saveStatus = (e) => {
    e.preventDefault();
    onStatus(emoji.trim() || text.trim() ? { emoji: emoji.trim(), text: text.trim() } : null);
  };
  const clearStatus = () => {
    setEmoji('');
    setText('');
    onStatus(null);
  };

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <h2 id="settings-title">Settings</h2>
          <button className="text-btn" onClick={onClose}>Done</button>
        </header>

        <AccountSection me={me} onChangePassword={onChangePassword} onLogout={onLogout} />

        <section>
          <h3>Status</h3>
          <form className="status-form" onSubmit={saveStatus}>
            <input className="field emoji-field" value={emoji} maxLength={4} onChange={(e) => setEmoji(e.target.value)} aria-label="Status emoji" placeholder="🙂" />
            <input className="field" value={text} maxLength={60} onChange={(e) => setText(e.target.value)} aria-label="Status text" placeholder="What are you up to?" />
            <button className="primary" type="submit">Save</button>
          </form>
          <div className="chips">
            {STATUS_PRESETS.map((s) => (
              <button key={s.text} className="chip" onClick={() => { setEmoji(s.emoji); setText(s.text); onStatus(s); }}>
                <Emoji char={s.emoji} /> {s.text}
              </button>
            ))}
            {me.status && <button className="chip ghost" onClick={clearStatus}>Clear status</button>}
          </div>
        </section>

        <section>
          <h3>Profile</h3>
          <form className="profile-form" onSubmit={saveProfile}>
            <label className="field-label" htmlFor="pronouns">Pronouns</label>
            <input id="pronouns" className="field" value={pronouns} maxLength={20} onChange={(e) => setPronouns(e.target.value)} placeholder="e.g. she/her, he/him, they/them" />
            <label className="field-label" htmlFor="bio">About you</label>
            <textarea id="bio" className="field" rows={3} value={bio} maxLength={160} onChange={(e) => setBio(e.target.value)} placeholder="A line or two about you" />
            <p className="hint count-hint">{bio.length}/160</p>
            <label className="field-label" htmlFor="tz">Time zone</label>
            {zoneList.length > 0 ? (
              <select id="tz" className="field" value={tz} onChange={(e) => setTz(e.target.value)}>
                <option value="">Not shown</option>
                {tz && !zoneList.includes(tz) && <option value={tz}>{tz}</option>}
                {zoneList.map((z) => (
                  <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>
                ))}
              </select>
            ) : (
              <input id="tz" className="field" value={tz} onChange={(e) => setTz(e.target.value)} placeholder="e.g. America/Detroit" />
            )}
            <div className="inline-actions">
              <button className="primary" type="submit" disabled={!dirty}>Save profile</button>
              {browserTz() && tz !== browserTz() && (
                <button className="chip" type="button" onClick={() => setTz(browserTz())}>Use {browserTz().replace(/_/g, ' ')}</button>
              )}
              {saved && <span className="saved">Saved</span>}
            </div>
          </form>
        </section>

        <section>
          <h3>Your color</h3>
          <div className="swatches">
            {COLORS.map((c) => {
              const on = c.toLowerCase() === (me.color || '').toLowerCase();
              return <button key={c} className={on ? 'swatch on' : 'swatch'} style={{ background: c }} aria-label={`Use color ${c}`} aria-pressed={on} onClick={() => onColor(c)} />;
            })}
          </div>
        </section>

        <section>
          <h3>Appearance</h3>
          <Segmented label="Theme" value={appearance.theme} options={THEMES} onChange={(theme) => set({ theme })} />
          <h3 className="sub">Accent</h3>
          <div className="swatches">
            {ACCENTS.map(([v, name, c]) => (
              <button key={v} className={appearance.accent === v ? 'swatch on' : 'swatch'} style={{ background: c }} aria-label={`${name} accent`} aria-pressed={appearance.accent === v} onClick={() => set({ accent: v })} />
            ))}
          </div>
          <h3 className="sub">Message style</h3>
          <Segmented label="Message style" value={appearance.style} options={STYLES} onChange={(style) => set({ style })} />
          <h3 className="sub">Text size</h3>
          <Segmented label="Text size" value={appearance.size} options={SIZES} onChange={(size) => set({ size })} />
        </section>

        <section>
          <h3>Alerts for direct messages, @mentions and friend requests</h3>
          <label className="check">
            <input type="checkbox" checked={prefs.sound} onChange={(e) => onPrefs({ ...prefs, sound: e.target.checked })} />
            Play a sound
          </label>
          <label className="check">
            <input type="checkbox" checked={prefs.desktop} onChange={(e) => onPrefs({ ...prefs, desktop: e.target.checked })} />
            Show desktop notifications when this tab is in the background
          </label>
          {denied && <p className="hint">Notifications are blocked for this site. Allow them in your browser’s site settings.</p>}
        </section>
      </div>
    </div>
  );
}
