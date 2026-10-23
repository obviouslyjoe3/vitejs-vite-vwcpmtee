import { useEffect, useState } from 'react';
import { COLORS, ACCENTS, STATUS_PRESETS } from '../constants.js';

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

export default function Settings({ me, appearance, prefs, onAppearance, onColor, onStatus, onPrefs, onClose }) {
  const [emoji, setEmoji] = useState(me.status?.emoji || '');
  const [text, setText] = useState(me.status?.text || '');

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
                {s.emoji} {s.text}
              </button>
            ))}
            {me.status && <button className="chip ghost" onClick={clearStatus}>Clear status</button>}
          </div>
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
          <h3>Alerts for direct messages and @mentions</h3>
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
