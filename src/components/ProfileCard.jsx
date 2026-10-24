import { useEffect, useState } from 'react';
import { fmtClock } from '../format.js';
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

export function ProfileFacts({ user }) {
  const time = localTime(user.tz);
  return (
    <>
      {user.pronouns && <p className="pronouns">{user.pronouns}</p>}
      {user.status && (
        <p className="status-line">
          <Emoji char={user.status.emoji} /> {user.status.text}
        </p>
      )}
      {user.bio && <p className="bio">{user.bio}</p>}
      {time && (
        <p className="fact">
          <Icon name="clock" size={14} /> {time} local time · {user.tz.replace(/_/g, ' ')}
        </p>
      )}
    </>
  );
}

// relation: 'friends' | 'incoming' (they asked you) | 'outgoing' (you asked them) | 'none'
export default function ProfileCard({
  user, me, relation, canMessage, isBlocked, onMessage, onEdit, onClose,
  onAddFriend, onAccept, onDecline, onCancel, onRemove, onBlock, onUnblock,
}) {
  const [error, setError] = useState('');
  const act = async (fn) => {
    const res = await fn(user);
    setError(res?.error || '');
  };
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const mine = user.id === me.id;
  const joined = since(user.joinedAt);

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div
        className="dialog profile-card"
        role="dialog"
        aria-modal="true"
        aria-label={`${user.name}'s profile`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button className="icon-btn close" onClick={onClose} aria-label="Close profile">
          <Icon name="close" size={16} />
        </button>
        <div className="profile-top">
          <Avatar user={user} size={84} online={mine ? true : user.online} />
          <h2>
            {user.name}
            {mine && <small> (you)</small>}
          </h2>
          {relation === 'friends' && <span className="friend-tag"><Icon name="check" size={12} /> Friends</span>}
          <p className="presence-line">
            {mine || user.online
              ? 'Online now'
              : user.lastSeen
              ? `Last seen ${ago(user.lastSeen)}`
              : 'Offline'}
          </p>
        </div>
        <div className="profile-body">
          <ProfileFacts user={user} />
          {joined && (
            <p className="fact">
              <Icon name="user" size={14} /> Member since {joined}
            </p>
          )}
          {!user.bio && !user.pronouns && !user.status && !user.tz && (
            <p className="fact muted-note">{mine ? 'Add a bio, pronouns and your time zone in Settings.' : 'No profile details yet.'}</p>
          )}
        </div>
        <div className="profile-actions">
          {mine ? (
            <button className="primary" onClick={onEdit}>
              Edit profile
            </button>
          ) : isBlocked ? (
            <>
              <span className="pill-note"><Icon name="ban" size={13} /> You blocked {user.name}</span>
              <button className="secondary" onClick={() => act(onUnblock)}>Unblock</button>
            </>
          ) : (
            <>
              {canMessage && (
                <button className="primary" onClick={() => onMessage(user)}>
                  <Icon name="send" size={15} /> Message
                </button>
              )}
              {relation === 'none' && (
                <button className={canMessage ? 'secondary' : 'primary'} onClick={() => act(onAddFriend)}>
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
                  <span className="pill-note">Request sent</span>
                  <button className="text-btn" onClick={() => act(onCancel)}>Cancel</button>
                </>
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
            </>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
      </div>
    </div>
  );
}
