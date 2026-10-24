import { useEffect, useId, useRef, useState } from 'react';
import { COLORS, ACCENTS, STATUS_PRESETS, BANNERS, bannerCss, INTEREST_IDEAS, DM_POLICIES } from '../constants.js';
import { Banner, localTime } from './ProfileCard.jsx';
import { beep } from '../notify.js';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import Emoji from '../Emoji.jsx';

/* ---------- small building blocks ---------- */

const SECTIONS = [
  ['profile', 'Profile', 'user'],
  ['account', 'Account', 'lock'],
  ['privacy', 'Privacy & blocking', 'ban'],
  ['appearance', 'Appearance', 'palette'],
  ['notifications', 'Notifications', 'bell'],
  ['messaging', 'Messaging', 'send'],
  ['shortcuts', 'Shortcuts', 'command'],
  ['data', 'Data & reset', 'trash'],
];

const WALLS = [['dots', 'Dots'], ['plain', 'Plain'], ['grid', 'Grid'], ['aurora', 'Aurora'], ['dusk', 'Dusk']];

function Segmented({ label, value, options, onChange }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

function Switch({ checked, onChange, label, disabled }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className={checked ? 'switch on' : 'switch'} onClick={() => onChange(!checked)}>
      <span />
    </button>
  );
}

// One setting: text on the left, its control on the right (stacks on narrow screens).
function Row({ title, desc, children, stack }) {
  const id = useId();
  return (
    <div className={stack ? 'set-row stack' : 'set-row'}>
      <div className="set-text">
        <div className="set-title" id={id}>{title}</div>
        {desc && <p className="set-desc">{desc}</p>}
      </div>
      <div className="set-control" aria-labelledby={id}>{children}</div>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div className="set-card">
      {title && <h4>{title}</h4>}
      {children}
    </div>
  );
}

function Toggle({ title, desc, checked, onChange, disabled }) {
  return (
    <Row title={title} desc={desc}>
      <Switch checked={checked} onChange={onChange} label={title} disabled={disabled} />
    </Row>
  );
}

// Two-step button so nothing destructive happens on a single click.
function ConfirmButton({ label, confirmLabel = 'Yes, do it', onConfirm, danger, disabled }) {
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    if (!asking) return undefined;
    const t = setTimeout(() => setAsking(false), 5000);
    return () => clearTimeout(t);
  }, [asking]);
  if (!asking) {
    return (
      <button type="button" className={danger ? 'chip danger' : 'chip'} disabled={disabled} onClick={() => setAsking(true)}>
        {label}
      </button>
    );
  }
  return (
    <span className="confirm">
      <button type="button" className={danger ? 'chip danger on' : 'chip'} onClick={() => { setAsking(false); onConfirm(); }}>{confirmLabel}</button>
      <button type="button" className="chip ghost" onClick={() => setAsking(false)}>Cancel</button>
    </span>
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

/* ---------- sections ---------- */

function InterestsEditor({ value, onChange }) {
  const [text, setText] = useState('');
  const full = value.length >= 6;
  const add = (raw) => {
    const t = raw.replace(/\s+/g, ' ').trim().slice(0, 20);
    if (!t || full || value.some((v) => v.toLowerCase() === t.toLowerCase())) return setText('');
    onChange([...value, t]);
    setText('');
  };
  const ideas = INTEREST_IDEAS.filter((i) => !value.some((v) => v.toLowerCase() === i.toLowerCase())).slice(0, 6);
  return (
    <div className="interests-editor">
      <div className="interest-row" aria-live="polite">
        {value.map((t) => (
          <span key={t} className="interest removable">
            {t}
            <button type="button" onClick={() => onChange(value.filter((v) => v !== t))} aria-label={`Remove ${t}`}>
              <Icon name="close" size={11} />
            </button>
          </span>
        ))}
        {value.length === 0 && <span className="hint">Up to 6 things you like. They show on your profile.</span>}
      </div>
      <div className="status-form">
        <input
          className="field"
          value={text}
          maxLength={20}
          disabled={full}
          placeholder={full ? 'You have 6 interests' : 'Type one and press Enter'}
          aria-label="Add an interest"
          onChange={(e) => setText(e.target.value.replace(',', ''))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add(text);
            }
          }}
        />
        <button type="button" className="chip" disabled={!text.trim() || full} onClick={() => add(text)}>Add</button>
      </div>
      {!full && (
        <div className="chips">
          {ideas.map((i) => (
            <button key={i} type="button" className="chip ghost" onClick={() => add(i)}>+ {i}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// What other people will see, updated as you type
function ProfilePreview({ me, draft }) {
  const user = { ...me, ...draft };
  const time = localTime(user.tz);
  return (
    <div className="pc-preview" aria-label="Profile preview">
      <Banner user={user} />
      <div className="pcp-head">
        <Avatar user={user} size={64} online />
        <div>
          <strong>{me.name}</strong>
          {user.pronouns && <span className="pronoun-tag">{user.pronouns}</span>}
          <p>{me.status ? <><Emoji char={me.status.emoji} /> {me.status.text}</> : 'No status set'}</p>
        </div>
      </div>
      {user.bio && <p className="bio-full">{user.bio}</p>}
      {user.interests?.length > 0 && (
        <p className="interest-row">
          {user.interests.map((t) => <span key={t} className="interest">{t}</span>)}
        </p>
      )}
      <ul className="pc-facts">
        {user.location && <li><Icon name="mapPin" size={14} /> <span>{user.location}</span></li>}
        {time && <li><Icon name="clock" size={14} /> <span>{time} local time</span></li>}
        {user.website && <li><Icon name="link" size={14} /> <span>{user.website.replace(/^https?:\/\//i, '')}</span></li>}
      </ul>
    </div>
  );
}


// Crop the middle square of a picture and shrink it to a small JPEG for a profile picture.
function photoToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) return reject(new Error('Choose an image file.'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 192;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 192, 192);
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 192, 192);
      URL.revokeObjectURL(url);
      let out = canvas.toDataURL('image/jpeg', 0.85);
      if (out.length > 60000) out = canvas.toDataURL('image/jpeg', 0.6);
      if (out.length > 60000) reject(new Error('That picture is too detailed. Try another one.'));
      else resolve(out);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file could not be read as an image.'));
    };
    img.src = url;
  });
}

function PhotoCard({ me, onProfile }) {
  const fileRef = useRef(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const change = async (file) => {
    if (!file) return;
    setNote('');
    setBusy(true);
    try {
      const res = await onProfile({ photo: await photoToDataUrl(file) });
      setNote(res?.error || 'Saved');
    } catch (err) {
      setNote(err.message);
    }
    setBusy(false);
    setTimeout(() => setNote(''), 2400);
  };
  return (
    <Card title="Profile picture">
      <div className="photo-row">
        <Avatar user={me} size={72} />
        <div className="photo-actions">
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { change(e.target.files[0]); e.target.value = ''; }} />
          <button type="button" className="secondary" disabled={busy} onClick={() => fileRef.current?.click()}>
            {me.photo ? 'Change picture' : 'Upload a picture'}
          </button>
          {me.photo && (
            <button type="button" className="text-btn" disabled={busy} onClick={() => onProfile({ photo: '' })}>
              Remove
            </button>
          )}
          {note && <span className={note === 'Saved' ? 'saved' : 'form-error inline'} role="status">{note}</span>}
        </div>
      </div>
      <p className="hint">Square pictures work best. Without one, you get your color and first letter.</p>
    </Card>
  );
}

function ProfileSection({ me, onColor, onStatus, onProfile }) {
  const [emoji, setEmoji] = useState(me.status?.emoji || '');
  const [text, setText] = useState(me.status?.text || '');
  const [bio, setBio] = useState(me.bio || '');
  const [pronouns, setPronouns] = useState(me.pronouns || '');
  const [tz, setTz] = useState(me.tz || '');
  const [location, setLocation] = useState(me.location || '');
  const [website, setWebsite] = useState(me.website || '');
  const [interests, setInterests] = useState(me.interests || []);
  const [saved, setSaved] = useState('');
  const zoneList = zones();
  const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  const dirty =
    bio.trim() !== (me.bio || '') ||
    pronouns.trim() !== (me.pronouns || '') ||
    tz !== (me.tz || '') ||
    location.trim() !== (me.location || '') ||
    website.trim() !== (me.website || '') ||
    !sameList(interests, me.interests || []);
  const badSite = website.trim() && !/^(https?:\/\/)?[^\s/]+\.[^\s/]+/i.test(website.trim());

  const saveProfile = async (e) => {
    e.preventDefault();
    if (badSite) return setSaved('That doesn’t look like a web address.');
    const res = await onProfile({ bio: bio.trim(), pronouns: pronouns.trim(), tz, location: location.trim(), website: website.trim(), interests });
    if (res?.user) {
      setWebsite(res.user.website || '');
      setInterests(res.user.interests || []);
    }
    setSaved(res?.error || 'Saved');
    setTimeout(() => setSaved(''), 1800);
  };
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
    <>
      <ProfilePreview me={me} draft={{ bio: bio.trim(), pronouns: pronouns.trim(), tz, location: location.trim(), website: website.trim(), interests }} />

      <PhotoCard me={me} onProfile={onProfile} />

      <Card title="Banner">
        <div className="banner-picker" role="radiogroup" aria-label="Profile banner">
          {BANNERS.map(([id, name, css]) => {
            const on = (me.banner || '') === id;
            return (
              <button key={id} type="button" role="radio" aria-checked={on} className={on ? 'banner-swatch on' : 'banner-swatch'} style={{ background: css }} title={name} onClick={() => onProfile({ banner: id })}>
                <span>{name}</span>
              </button>
            );
          })}
          <button type="button" role="radio" aria-checked={!me.banner} className={!me.banner ? 'banner-swatch on auto' : 'banner-swatch auto'} style={{ background: bannerCss({ color: me.color }) }} title="Match my color" onClick={() => onProfile({ banner: '' })}>
            <span>My color</span>
          </button>
        </div>
      </Card>

      <Card title="Your color">
        <div className="swatches">
          {COLORS.map((c) => {
            const on = c.toLowerCase() === (me.color || '').toLowerCase();
            return <button key={c} type="button" className={on ? 'swatch on' : 'swatch'} style={{ background: c }} aria-label={`Use color ${c}`} aria-pressed={on} onClick={() => onColor(c)} />;
          })}
        </div>
      </Card>

      <Card title="Status">
        <form className="status-form" onSubmit={saveStatus}>
          <input className="field emoji-field" value={emoji} maxLength={4} onChange={(e) => setEmoji(e.target.value)} aria-label="Status emoji" placeholder="🙂" />
          <input className="field" value={text} maxLength={60} onChange={(e) => setText(e.target.value)} aria-label="Status text" placeholder="What are you up to?" />
          <button className="primary" type="submit">Save</button>
        </form>
        <div className="chips">
          {STATUS_PRESETS.map((s) => (
            <button key={s.text} type="button" className="chip" onClick={() => { setEmoji(s.emoji); setText(s.text); onStatus(s); }}>
              <Emoji char={s.emoji} /> {s.text}
            </button>
          ))}
          {me.status && <button type="button" className="chip ghost" onClick={clearStatus}>Clear status</button>}
        </div>
      </Card>

      <Card title="About you">
        <form className="profile-form" onSubmit={saveProfile}>
          <label className="field-label" htmlFor="pronouns">Pronouns</label>
          <input id="pronouns" className="field" value={pronouns} maxLength={20} onChange={(e) => setPronouns(e.target.value)} placeholder="e.g. she/her, he/him, they/them" />
          <label className="field-label" htmlFor="bio">Bio</label>
          <textarea id="bio" className="field" rows={4} value={bio} maxLength={300} onChange={(e) => setBio(e.target.value)} placeholder="A few lines about you. Line breaks are kept." />
          <p className="hint count-hint">{bio.length}/300</p>
          <label className="field-label" htmlFor="location">Location</label>
          <input id="location" className="field" value={location} maxLength={40} onChange={(e) => setLocation(e.target.value)} placeholder="City, country, or just “the internet”" />
          <label className="field-label" htmlFor="website">Website</label>
          <input id="website" className="field" value={website} maxLength={120} inputMode="url" autoCapitalize="none" spellCheck={false} onChange={(e) => setWebsite(e.target.value)} placeholder="example.com" aria-invalid={!!badSite} />
          <label className="field-label">Interests</label>
          <InterestsEditor value={interests} onChange={setInterests} />
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
            {dirty && (
              <button className="chip ghost" type="button" onClick={() => {
                setBio(me.bio || ''); setPronouns(me.pronouns || ''); setTz(me.tz || '');
                setLocation(me.location || ''); setWebsite(me.website || ''); setInterests(me.interests || []);
              }}>Discard changes</button>
            )}
            {browserTz() && tz !== browserTz() && (
              <button className="chip" type="button" onClick={() => setTz(browserTz())}>Use {browserTz().replace(/_/g, ' ')}</button>
            )}
            {saved && <span className={saved === 'Saved' ? 'saved' : 'form-error inline'} role="status">{saved}</span>}
          </div>
        </form>
      </Card>
    </>
  );
}

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
    <>
      <Card title="Signed in">
        <Row title={me.name} desc="Your username. Sign-ins last 90 days from your last visit and are shared by every tab in this browser.">
          <button className="chip" type="button" onClick={onLogout}>Log out</button>
        </Row>
      </Card>
      <Card title="Password">
        <Row title="Change password" desc="Changing it signs out your other devices.">
          <button className="chip" type="button" onClick={() => { setOpen((v) => !v); setNote(null); }} aria-expanded={open}>
            {open ? 'Cancel' : 'Change…'}
          </button>
        </Row>
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
      </Card>
    </>
  );
}

const THEMES = [
  ['system', 'System'],
  ['light', 'Light'],
  ['dark', 'Dark'],
];
const STYLES = [['bubbles', 'Bubbles'], ['flat', 'Flat']];
const SIZES = [['s', 'Small'], ['m', 'Medium'], ['l', 'Large']];
const DENSITY = [['comfortable', 'Comfortable'], ['compact', 'Compact']];
const CLOCKS = [['system', 'Auto'], ['12', '12-hour'], ['24', '24-hour']];
const MOTION = [['system', 'Auto'], ['full', 'Full'], ['reduced', 'Reduced']];
const EMOJI_STYLES = [['parley', 'Parley'], ['system', 'System']];

function Preview({ appearance }) {
  const opts = { hour: 'numeric', minute: '2-digit' };
  if (appearance.clock === '12') opts.hourCycle = 'h12';
  if (appearance.clock === '24') opts.hourCycle = 'h23';
  const time = new Date().toLocaleTimeString([], opts);
  const flat = appearance.style === 'flat';
  const lines = [
    { who: 'Maya', color: '#2A6FBF', text: 'Lunch at 12:30? I found a spot with a patio.', mine: false },
    { who: 'You', color: '#5B3FD9', text: 'Yes please. Save me a seat. 🙌', mine: true },
  ];
  return (
    <div className={`pv ${flat ? 'flat' : 'bubbles'} ${appearance.density}`} aria-hidden="true">
      {lines.map((l) => (
        <div key={l.who} className={l.mine && !flat ? 'pv-msg mine' : 'pv-msg'}>
          {appearance.avatars && <span className="pv-av" style={{ background: l.color }}>{l.who[0]}</span>}
          <div className="pv-main">
            <div className="pv-meta"><strong>{l.who}</strong> <time>{time}</time></div>
            <div className="pv-bubble">{l.text}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function AppearanceSection({ appearance, onAppearance }) {
  const set = (patch) => onAppearance({ ...appearance, ...patch });
  return (
    <>
      <Preview appearance={appearance} />

      <Card title="Theme">
        <div className="theme-cards" role="radiogroup" aria-label="Theme">
          {THEMES.map(([v, name]) => (
            <button key={v} type="button" role="radio" aria-checked={appearance.theme === v} className={appearance.theme === v ? 'theme-card on' : 'theme-card'} onClick={() => set({ theme: v })}>
              <span className={`theme-thumb ${v}`}><i /><i /><i /></span>
              {name}
            </button>
          ))}
        </div>
        <h5>Accent color</h5>
        <div className="swatches">
          {ACCENTS.map(([v, name, c]) => (
            <button key={v} type="button" className={appearance.accent === v ? 'swatch on' : 'swatch'} style={{ background: c }} aria-label={`${name} accent`} aria-pressed={appearance.accent === v} title={name} onClick={() => set({ accent: v })} />
          ))}
        </div>
      </Card>

      <Card title="Messages">
        <Row title="Message style" desc="Chat bubbles, or a flat list like a log.">
          <Segmented label="Message style" value={appearance.style} options={STYLES} onChange={(style) => set({ style })} />
        </Row>
        <Row title="Text size">
          <Segmented label="Text size" value={appearance.size} options={SIZES} onChange={(size) => set({ size })} />
        </Row>
        <Row title="Spacing" desc="Compact fits more messages on screen.">
          <Segmented label="Spacing" value={appearance.density} options={DENSITY} onChange={(density) => set({ density })} />
        </Row>
        <Toggle title="Show avatars" desc="The round picture beside each message." checked={appearance.avatars} onChange={(avatars) => set({ avatars })} />
        <Row title="Chat background" desc="The backdrop behind your messages." stack>
          <div className="wall-picker" role="radiogroup" aria-label="Chat background">
            {WALLS.map(([id, name]) => (
              <button key={id} type="button" role="radio" aria-checked={(appearance.wall || 'dots') === id} className={`wall-card ${(appearance.wall || 'dots') === id ? 'on' : ''}`} onClick={() => set({ wall: id })}>
                <span className={`wall-thumb w-${id}`} />
                {name}
              </button>
            ))}
          </div>
        </Row>
        <Row title="Time format" desc="Applies to message times and people’s local time.">
          <Segmented label="Time format" value={appearance.clock} options={CLOCKS} onChange={(clock) => set({ clock })} />
        </Row>
      </Card>

      <Card title="Emoji and motion">
        <Row title="Emoji style" desc="Parley’s hand-drawn set, or your device’s own emoji.">
          <Segmented label="Emoji style" value={appearance.emoji} options={EMOJI_STYLES} onChange={(emoji) => set({ emoji })} />
        </Row>
        <Row title="Animations" desc="Auto follows your device’s reduce-motion setting.">
          <Segmented label="Animations" value={appearance.motion} options={MOTION} onChange={(motion) => set({ motion })} />
        </Row>
      </Card>
    </>
  );
}

const SCOPES = [
  ['default', 'Direct messages and @mentions', 'The default. Rooms stay quiet unless someone mentions you.'],
  ['all', 'Every message', 'All conversations you have not muted.'],
  ['mentions', '@mentions only', 'Even direct messages stay quiet.'],
];

function NotificationsSection({ prefs, onPrefs }) {
  const set = (patch) => onPrefs({ ...prefs, ...patch });
  const supported = typeof Notification !== 'undefined';
  const denied = supported && Notification.permission === 'denied';
  const volRef = useRef(null);
  return (
    <>
      <Card>
        <Toggle title="Pause all alerts" desc="Silences sounds and desktop notifications until you turn this off. Unread counts still update." checked={prefs.pause} onChange={(pause) => set({ pause })} />
        <Toggle title="Quiet hours" desc="Silence alerts on a daily schedule." checked={prefs.quiet} onChange={(quiet) => set({ quiet })} />
        {prefs.quiet && (
          <div className="quiet-times">
            <label>
              From
              <input type="time" className="field" value={prefs.quietFrom} onChange={(e) => e.target.value && set({ quietFrom: e.target.value })} />
            </label>
            <label>
              Until
              <input type="time" className="field" value={prefs.quietTo} onChange={(e) => e.target.value && set({ quietTo: e.target.value })} />
            </label>
          </div>
        )}
      </Card>

      <Card title="What alerts you">
        <div className="choices" role="radiogroup" aria-label="What alerts you">
          {SCOPES.map(([v, name, desc]) => (
            <button key={v} type="button" role="radio" aria-checked={prefs.scope === v} className={prefs.scope === v ? 'choice on' : 'choice'} onClick={() => set({ scope: v })}>
              <span className="radio-dot" />
              <span>
                <strong>{name}</strong>
                <small>{desc}</small>
              </span>
            </button>
          ))}
        </div>
        <p className="hint">Friend requests always alert. Muted conversations only break through for @mentions.</p>
      </Card>

      <Card title="How you are alerted">
        <Toggle title="Play a sound" checked={prefs.sound} onChange={(sound) => set({ sound })} />
        {prefs.sound && (
          <Row title="Volume">
            <div className="volume">
              <input ref={volRef} type="range" min="0" max="100" step="5" value={prefs.volume} onChange={(e) => set({ volume: Number(e.target.value) })} aria-label="Alert volume" style={{ '--pct': `${prefs.volume}%` }} />
              <output>{prefs.volume}%</output>
              <button type="button" className="chip" onClick={() => beep(prefs.volume)}>Test</button>
            </div>
          </Row>
        )}
        <Toggle title="Desktop notifications" desc="Shown when this tab is in the background." checked={prefs.desktop} onChange={(desktop) => set({ desktop })} disabled={!supported} />
        {prefs.desktop && (
          <Toggle title="Show message text" desc="Turn off to keep notifications generic, like “New message”." checked={prefs.preview} onChange={(preview) => set({ preview })} />
        )}
        {!supported && <p className="hint">This browser does not support desktop notifications.</p>}
        {denied && <p className="hint">Notifications are blocked for this site. Allow them in your browser’s site settings.</p>}
        <Toggle title="Unread count in the tab title" desc="Shows “(3) Parley” while you have unread messages." checked={prefs.title} onChange={(title) => set({ title })} />
      </Card>
    </>
  );
}

const SEND_KEYS = [['enter', 'Enter'], ['mod', 'Ctrl/Cmd+Enter']];

function MessagingSection({ prefs, onPrefs }) {
  const set = (patch) => onPrefs({ ...prefs, ...patch });
  return (
    <>
      <Card title="Writing">
        <Row title="Send with" desc={prefs.sendKey === 'mod' ? 'Enter starts a new line.' : 'Shift+Enter starts a new line.'}>
          <Segmented label="Send with" value={prefs.sendKey} options={SEND_KEYS} onChange={(sendKey) => set({ sendKey })} />
        </Row>
        <Toggle title="Convert :shortcodes: to emoji" desc="Typing :fire: sends 🔥. Turn off to send the text as typed." checked={prefs.shortcodes} onChange={(shortcodes) => set({ shortcodes })} />
        <Toggle title="Check spelling" desc="Uses your browser’s spell checker in the message box." checked={prefs.spellcheck} onChange={(spellcheck) => set({ spellcheck })} />
      </Card>
      <Card title="Message requests">
        <Toggle title="Alert me about new requests" desc="A toast, plus a sound or desktop notification if those are on. Requests never count as unread messages." checked={prefs.reqAlerts !== false} onChange={(reqAlerts) => set({ reqAlerts })} />
      </Card>
      <Card title="Privacy">
        <Toggle title="Share typing status" desc="Let others see “is typing…” while you write. You will still see theirs." checked={prefs.typing} onChange={(typing) => set({ typing })} />
      </Card>
    </>
  );
}

const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '');
const MOD = mac ? '⌘' : 'Ctrl';
const SHORTCUTS = [
  [[MOD, 'K'], 'Open the quick switcher'],
  [['Enter'], 'Send (or new line, if you changed the send key)'],
  [['Shift', 'Enter'], 'New line'],
  [['↑'], 'Edit your last message (message box empty)'],
  [[MOD, 'B'], 'Bold the selection'],
  [[MOD, 'I'], 'Italic the selection'],
  [['Alt', '↑ / ↓'], 'Previous / next conversation'],
  [['Esc'], 'Close dialogs, menus and side panels'],
  [['?'], 'Show the shortcut list from anywhere'],
  [['@'], 'Mention someone'],
  [[':'], 'Emoji shortcodes, like :fire:'],
];

function ShortcutsSection() {
  return (
    <>
      <Card title="Keyboard">
        <ul className="shortcuts">
          {SHORTCUTS.map(([keys, what]) => (
            <li key={what}>
              <span>{what}</span>
              <span className="keys">
                {keys.map((k) => <kbd key={k}>{k}</kbd>)}
              </span>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Slash commands">
        <ul className="shortcuts">
          {[['/me', 'Describe an action'], ['/shrug', 'Add ¯\\_(ツ)_/¯'], ['/poll', 'Start a poll'], ['/roll 2d6', 'Roll dice (rolled on the server)'], ['/flip', 'Flip a coin'], ['/tableflip', 'Add (╯°□°)╯︵ ┻━┻'], ['/unflip', 'Put the table back'], ['/lenny', 'Add ( ͡° ͜ʖ ͡°)']].map(([cmd, what]) => (
            <li key={cmd}>
              <span>{what}</span>
              <code>{cmd}</code>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

function PrivacySection({ privacy, onPrivacy, blocked, onUnblock }) {
  const [busy, setBusy] = useState('');
  const unblock = async (b) => {
    setBusy(b.id);
    await onUnblock(b.id);
    setBusy('');
  };
  return (
    <>
      <Card title="Who can message you">
        <div className="choices" role="radiogroup" aria-label="Who can message you">
          {DM_POLICIES.map(([v, name, desc]) => (
            <button key={v} type="button" role="radio" aria-checked={privacy.dms === v} className={privacy.dms === v ? 'choice on' : 'choice'} onClick={() => onPrivacy({ dms: v })}>
              <span className="radio-dot" />
              <span>
                <strong>{name}</strong>
                <small>{desc}</small>
              </span>
            </button>
          ))}
        </div>
        <p className="hint">
          Anyone who isn’t your friend lands in <strong>Message requests</strong> first: text only, three messages at most,
          and no alerts until you accept. Deleting a request doesn’t tell them.
        </p>
      </Card>
      <Card title="Visibility">
        <Row title="Appear offline" desc="Hide your online status and last-seen time from everyone. You still get messages as usual.">
          <Switch label="Appear offline" checked={!privacy.showOnline} onChange={(v) => onPrivacy({ showOnline: !v })} />
        </Row>
        <Row title="Read receipts" desc="Show “Seen” in direct messages. It works both ways: if you turn it off, you won’t see theirs either.">
          <Switch label="Read receipts" checked={privacy.readReceipts !== false} onChange={(v) => onPrivacy({ readReceipts: v })} />
        </Row>
        <Row title="Friend requests" desc="Who can send you new friend requests. Anyone who already asked you can still be accepted." stack>
          <Segmented
            label="Who can send friend requests"
            value={privacy.requests}
            options={[['everyone', 'Everyone'], ['nobody', 'Nobody']]}
            onChange={(v) => onPrivacy({ requests: v })}
          />
        </Row>
      </Card>
      <Card title={`Blocked people${blocked.length ? ` (${blocked.length})` : ''}`}>
        <p className="hint" style={{ marginTop: 0 }}>
          Blocked people can’t message you or send friend requests, and their messages in rooms are hidden from you.
          They aren’t told you blocked them. Blocking also removes them from your friends.
        </p>
        {blocked.length === 0 ? (
          <p className="panel-empty tight">You haven’t blocked anyone.</p>
        ) : (
          <ul className="people rows blocked-list">
            {blocked.map((b) => (
              <li key={b.id} className="person-row">
                <span className="person-btn static">
                  <Avatar user={b} size={34} />
                  <span className="people-name"><strong>{b.name}</strong></span>
                </span>
                <button className="chip" disabled={busy === b.id} onClick={() => unblock(b)}>Unblock</button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function DataSection({ savedCount, onClearDrafts, onClearSaved, onReset }) {
  const [done, setDone] = useState('');
  const run = (fn, msg) => () => {
    fn();
    setDone(msg);
    setTimeout(() => setDone(''), 2500);
  };
  return (
    <>
      <Card title="On this browser">
        <Row title="Unsent drafts" desc="Messages you started typing but did not send.">
          <ConfirmButton label="Clear drafts" confirmLabel="Clear" onConfirm={run(onClearDrafts, 'Drafts cleared.')} />
        </Row>
        <Row title="Saved messages" desc={`${savedCount} saved. Removing them here does not delete the original messages.`}>
          <ConfirmButton label="Clear saved" confirmLabel="Clear" disabled={!savedCount} onConfirm={run(onClearSaved, 'Saved messages cleared.')} />
        </Row>
      </Card>
      <Card title="Reset">
        <Row title="Restore default settings" desc="Resets appearance, alerts and messaging options. Your profile, account and conversations are not touched.">
          <ConfirmButton danger label="Reset settings" confirmLabel="Reset" onConfirm={run(onReset, 'Settings restored to defaults.')} />
        </Row>
      </Card>
      {done && <p className="saved" role="status">{done}</p>}
    </>
  );
}

/* ---------- dialog ---------- */

export default function Settings({
  me, appearance, prefs, savedCount = 0, blocked = [], privacy = { requests: 'everyone', showOnline: true, dms: 'everyone', readReceipts: true }, initialSection = 'profile', onPrivacy, onUnblock,
  onAppearance, onColor, onStatus, onProfile, onPrefs, onChangePassword, onLogout,
  onClearDrafts, onClearSaved, onReset, onClose,
}) {
  const [section, setSection] = useState(initialSection);
  const body = useRef(null);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    body.current?.scrollTo?.({ top: 0 });
  }, [section]);

  const current = SECTIONS.find(([id]) => id === section);

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="dialog settings" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <h2 id="settings-title">Settings</h2>
          <button className="text-btn" type="button" onClick={onClose}>Done</button>
        </header>
        <div className="settings-layout">
          <nav className="settings-nav" aria-label="Settings sections">
            {SECTIONS.map(([id, name, icon]) => (
              <button key={id} type="button" className={section === id ? 'on' : ''} aria-current={section === id ? 'page' : undefined} onClick={() => setSection(id)}>
                <Icon name={icon} size={17} /> <span>{name}</span>
              </button>
            ))}
          </nav>
          <div className="settings-body" ref={body}>
            <h3 className="settings-heading">{current[1]}</h3>
            {section === 'profile' && <ProfileSection me={me} onColor={onColor} onStatus={onStatus} onProfile={onProfile} />}
            {section === 'account' && <AccountSection me={me} onChangePassword={onChangePassword} onLogout={onLogout} />}
            {section === 'privacy' && <PrivacySection privacy={privacy} onPrivacy={onPrivacy} blocked={blocked} onUnblock={onUnblock} />}
            {section === 'appearance' && <AppearanceSection appearance={appearance} onAppearance={onAppearance} />}
            {section === 'notifications' && <NotificationsSection prefs={prefs} onPrefs={onPrefs} />}
            {section === 'messaging' && <MessagingSection prefs={prefs} onPrefs={onPrefs} />}
            {section === 'shortcuts' && <ShortcutsSection />}
            {section === 'data' && <DataSection savedCount={savedCount} onClearDrafts={onClearDrafts} onClearSaved={onClearSaved} onReset={onReset} />}
          </div>
        </div>
      </div>
    </div>
  );
}
