import { useEffect, useRef, useState } from 'react';
import { fmtClock } from '../format.js';
import { bannerCss } from '../constants.js';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import Emoji from '../Emoji.jsx';

const ago = (ts) => {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
};

export const localTime = (tz) => {
  if (!tz) return null;
  try {
    return fmtClock(Date.now(), tz);
  } catch {
    return null;
  }
};

const since = (ts) =>
  ts ? new Date(ts).toLocaleDateString([], { month: 'long', year: 'numeric' }) : null;

const hostOf = (url) => {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
};

// Only ever link out to plain web addresses (the server already checks, this is a second guard).
const safeHref = (url) => (/^https?:\/\//i.test(url || '') ? url : null);

// Time zone offset difference, as "3 h ahead of you"
export const tzNote = (tz) => {
  if (!tz) return '';
  try {
    const off = (zone) => {
      const d = new Date();
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour12: false, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(d);
      const g = (t) => Number(parts.find((p) => p.type === t).value);
      return (Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute')) - d.getTime()) / 3_600_000;
    };
    const mine = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const diff = Math.round((off(tz) - off(mine)) * 2) / 2;
    if (diff === 0) return 'same time as you';
    const n = Math.abs(diff);
    return `${n} h ${diff > 0 ? 'ahead of' : 'behind'} you`;
  } catch {
    return '';
  }
};

// Compact facts, used in the conversation details panel
export function ProfileFacts({ user }) {
  const time = localTime(user.tz);
  const href = safeHref(user.website);
  return (
    <>
      {user.pronouns && <p className="pronouns">{user.pronouns}</p>}
      {user.status && (
        <p className="status-line">
          <Emoji char={user.status.emoji} /> {user.status.text}
        </p>
      )}
      {user.bio && <p className="bio">{user.bio}</p>}
      {user.location && (
        <p className="fact">
          <Icon name="mapPin" size={14} /> {user.location}
        </p>
      )}
      {time && (
        <p className="fact">
          <Icon name="clock" size={14} /> {time} local time · {user.tz.replace(/_/g, ' ')}
        </p>
      )}
      {href && (
        <p className="fact">
          <Icon name="link" size={14} />
          <a href={href} target="_blank" rel="noopener noreferrer nofollow">{hostOf(href)}</a>
        </p>
      )}
      {user.interests?.length > 0 && (
        <p className="interest-row">
          {user.interests.map((t) => (
            <span key={t} className="interest">{t}</span>
          ))}
        </p>
      )}
    </>
  );
}

export function Banner({ user, className = '' }) {
  return <div className={`banner-art ${className}`} style={{ background: bannerCss(user) }} aria-hidden="true" />;
}

// Private note about someone. Saved when you leave the box.
function NoteBox({ value, onSave }) {
  const [text, setText] = useState(value);
  const [state, setState] = useState('');
  const last = useRef(value);
  useEffect(() => {
    setText(value);
    last.current = value;
  }, [value]);
  const commit = async () => {
    const t = text.trim();
    if (t === last.current) return;
    const res = await onSave(t);
    if (res?.error) return setState(res.error);
    last.current = res.note ?? t;
    setState('Saved');
    setTimeout(() => setState(''), 1400);
  };
  return (
    <div className="note-box">
      <label className="field-label" htmlFor="person-note">
        <Icon name="note" size={13} /> Private note <small>Only you can see this</small>
      </label>
      <textarea
        id="person-note"
        className="field"
        rows={2}
        maxLength={200}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        placeholder="Add something to remember about them"
      />
      <div className="note-foot">
        <span className={state === 'Saved' ? 'saved' : 'form-error inline'} role="status">{state}</span>
        <span className="hint">{text.length}/200</span>
      </div>
    </div>
  );
}

const WHY = {
  friends: (n) => `${n} only takes messages from friends.`,
  shared: (n) => `${n} only takes messages from friends and people they share a group with.`,
};

// relation: 'friends' | 'incoming' (they asked you) | 'outgoing' (you asked them) | 'none'
export default function ProfileCard({
  user, me, relation, hasDm, pendingIn, isBlocked, onLoadInfo, onSaveNote, onMessage, onEdit, onClose,
  onOpenPerson, onAddFriend, onAccept, onDecline, onCancel, onRemove, onBlock, onUnblock,
  isFavorite = false, friendsSince = 0, onFavorite,
}) {
  const [error, setError] = useState('');
  const [info, setInfo] = useState(null);
  const [copied, setCopied] = useState(false);
  const mine = user.id === me.id;

  const act = async (fn) => {
    const res = await fn(user);
    setError(res?.error || '');
  };

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // mutual friends, shared groups, your note, and how you can message them
  useEffect(() => {
    if (mine) return undefined;
    let live = true;
    setInfo(null);
    onLoadInfo?.(user.id).then((res) => live && !res.error && setInfo(res));
    return () => {
      live = false;
    };
  }, [user.id, relation, isBlocked]);

  const copyName = async () => {
    try {
      await navigator.clipboard.writeText(user.name);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  };

  const joined = since(user.joinedAt);
  const time = localTime(user.tz);
  const href = safeHref(user.website);
  const mode = info?.dm?.mode;
  const online = mine || user.online;
  const hasAbout = user.bio || user.pronouns || user.status || user.tz || user.location || href || user.interests?.length;

  const messageButton = () => {
    if (pendingIn) {
      return (
        <button className="primary" onClick={() => onMessage(user)}>
          <Icon name="inbox" size={15} /> View message request
        </button>
      );
    }
    if (relation === 'friends' || mode === 'open') {
      return (
        <button className="primary" onClick={() => onMessage(user)}>
          <Icon name="send" size={15} /> Message
        </button>
      );
    }
    if (mode === 'request') {
      return (
        <button className="primary" onClick={() => onMessage(user)}>
          <Icon name="send" size={15} /> {info.dm.started ? 'Open message request' : 'Send message request'}
        </button>
      );
    }
    if (mode === 'waiting') {
      return (
        <button className="secondary" onClick={() => onMessage(user)}>
          <Icon name="clock" size={15} /> Request sent
        </button>
      );
    }
    if (hasDm) {
      return (
        <button className="secondary" onClick={() => onMessage(user)}>
          <Icon name="send" size={15} /> View conversation
        </button>
      );
    }
    return null;
  };

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div
        className="dialog profile-card rich"
        role="dialog"
        aria-modal="true"
        aria-label={`${user.name}'s profile`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="pc-banner">
          <Banner user={user} />
          <button className="icon-btn close" onClick={onClose} aria-label="Close profile">
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="pc-head">
          <Avatar user={user} size={88} online={online} />
          <div className="pc-id">
            <h2>
              {user.name}
              {mine && <small> (you)</small>}
            </h2>
            <div className="pc-tags">
              {user.pronouns && <span className="pronoun-tag">{user.pronouns}</span>}
              {relation === 'friends' && (
                <span className="friend-tag" title={friendsSince ? `Friends since ${new Date(friendsSince).toLocaleDateString([], { dateStyle: 'medium' })}` : undefined}>
                  <Icon name="check" size={12} /> Friends{friendsSince ? ` since ${new Date(friendsSince).toLocaleDateString([], { month: 'short', year: 'numeric' })}` : ''}
                </span>
              )}
              {relation === 'friends' && isFavorite && <span className="friend-tag fav"><Icon name="star" size={12} /> Favorite</span>}
              {isBlocked && <span className="friend-tag blocked"><Icon name="ban" size={12} /> Blocked</span>}
              <span className="presence-line">
                {online ? 'Online now' : user.lastSeen ? `Last seen ${ago(user.lastSeen)}` : 'Offline'}
              </span>
            </div>
          </div>
          <button className="chip copy-name" onClick={copyName} title="Copy username">
            <Icon name="copy" size={13} /> {copied ? 'Copied' : `@${user.name}`}
          </button>
        </div>

        <div className="pc-body">
          {user.status && (
            <p className="pc-status">
              <Emoji char={user.status.emoji} /> <span>{user.status.text}</span>
            </p>
          )}

          {user.bio && (
            <section className="pc-sec">
              <h3>About</h3>
              <p className="bio-full">{user.bio}</p>
            </section>
          )}

          {user.interests?.length > 0 && (
            <section className="pc-sec">
              <h3>Interests</h3>
              <p className="interest-row">
                {user.interests.map((t) => (
                  <span key={t} className="interest">{t}</span>
                ))}
              </p>
            </section>
          )}

          <ul className="pc-facts">
            {user.location && (
              <li><Icon name="mapPin" size={15} /> <span>{user.location}</span></li>
            )}
            {time && (
              <li>
                <Icon name="clock" size={15} />
                <span>
                  {time} local time <small>{[user.tz.replace(/_/g, ' '), mine ? '' : tzNote(user.tz)].filter(Boolean).join(' · ')}</small>
                </span>
              </li>
            )}
            {href && (
              <li>
                <Icon name="link" size={15} />
                <a href={href} target="_blank" rel="noopener noreferrer nofollow">{hostOf(href)}</a>
              </li>
            )}
            {joined && (
              <li><Icon name="user" size={15} /> <span>Member since {joined}</span></li>
            )}
          </ul>

          {!hasAbout && (
            <p className="muted-note">
              {mine ? 'Add a bio, interests, a banner and your time zone in Settings.' : 'No profile details yet.'}
            </p>
          )}

          {!mine && info && (info.mutualFriendCount > 0 || info.mutualRoomCount > 0) && (
            <section className="pc-sec">
              <h3>In common</h3>
              {info.mutualFriendCount > 0 && (
                <div className="mutual">
                  <div className="mutual-faces">
                    {info.mutualFriends.slice(0, 5).map((f) => (
                      <button key={f.id} type="button" className="face" title={f.name} aria-label={`View ${f.name}'s profile`} onClick={() => onOpenPerson?.(f)}>
                        <Avatar user={f} size={26} />
                      </button>
                    ))}
                  </div>
                  <span>
                    {info.mutualFriendCount} mutual {info.mutualFriendCount === 1 ? 'friend' : 'friends'}
                    <small> {info.mutualFriends.slice(0, 3).map((f) => f.name).join(', ')}{info.mutualFriendCount > 3 ? ' and more' : ''}</small>
                  </span>
                </div>
              )}
              {info.mutualRoomCount > 0 && (
                <p className="interest-row groups">
                  {info.mutualRooms.map((r) => (
                    <span key={r.id} className="interest group">
                      {r.private ? <Icon name="lock" size={11} /> : '#'} {r.name}
                    </span>
                  ))}
                  {info.mutualRoomCount > info.mutualRooms.length && <span className="interest">+{info.mutualRoomCount - info.mutualRooms.length}</span>}
                </p>
              )}
            </section>
          )}

          {!mine && info && <NoteBox value={info.note} onSave={(text) => onSaveNote(user.id, text)} />}
        </div>

        <div className="profile-actions">
          {mine ? (
            <button className="primary" onClick={onEdit}>
              <Icon name="edit" size={15} /> Edit profile
            </button>
          ) : isBlocked ? (
            <>
              <span className="pill-note"><Icon name="ban" size={13} /> You blocked {user.name}</span>
              <button className="secondary" onClick={() => act(onUnblock)}>Unblock</button>
            </>
          ) : (
            <>
              {messageButton()}
              {mode === 'no' && !hasDm && info.dm.reason !== 'missing' && (
                <span className="pill-note wrap">{(WHY[info.dm.reason] || (() => 'They are not taking messages.'))(user.name)}</span>
              )}
              {relation === 'none' && (
                <button className={mode === 'request' || relation === 'friends' ? 'secondary' : 'primary'} onClick={() => act(onAddFriend)}>
                  <Icon name="userPlus" size={15} /> Add friend
                </button>
              )}
              {relation === 'incoming' && (
                <>
                  <button className="primary" onClick={() => act(onAccept)}>Accept request</button>
                  <button className="text-btn" onClick={() => act(onDecline)}>Decline</button>
                </>
              )}
              {relation === 'outgoing' && (
                <>
                  <span className="pill-note">Friend request sent</span>
                  <button className="text-btn" onClick={() => act(onCancel)}>Cancel</button>
                </>
              )}
              <span className="actions-end">
                {relation === 'friends' && onFavorite && (
                  <button className="text-btn" onClick={() => act(onFavorite)}>
                    <Icon name="star" size={14} /> {isFavorite ? 'Unfavorite' : 'Favorite'}
                  </button>
                )}
                {relation === 'friends' && (
                  <button
                    className="text-btn danger-text"
                    onClick={() => {
                      if (window.confirm(`Remove ${user.name} from your friends?`)) act(onRemove);
                    }}
                  >
                    Remove friend
                  </button>
                )}
                <button
                  className="text-btn danger-text"
                  onClick={() => {
                    if (window.confirm(`Block ${user.name}? They won’t be able to message you or send friend requests, and you’ll stop seeing their messages in rooms.`)) act(onBlock);
                  }}
                >
                  <Icon name="ban" size={14} /> Block
                </button>
              </span>
            </>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
      </div>
    </div>
  );
}
