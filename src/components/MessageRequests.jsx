import { useEffect, useState } from 'react';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import { fmtStamp } from '../format.js';
import { stripMarks } from '../richText.jsx';

// The inbox for people who are not your friends and wrote to you first.
// Nothing here alerts you like a normal message, and the sender is never told if you delete or ignore it.
export default function MessageRequests({
  requests, outgoing = [], onAccept, onDecline, onBlock, onProfile, onOpen, onClose,
}) {
  const [done, setDone] = useState({}); // dm id -> 'accepted'
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const run = async (key, fn, after) => {
    setBusy(key);
    const res = await fn();
    setBusy('');
    if (res?.error) return setError(res.error);
    setError('');
    after?.();
  };

  // a request you accepted leaves the live list; keep a row so you can jump straight in
  const accepted = Object.entries(done).filter(([id]) => !requests.some((r) => r.id === id));

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="dialog wide requests" role="dialog" aria-modal="true" aria-labelledby="requests-title" onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <h2 id="requests-title">Message requests</h2>
          <button className="text-btn" onClick={onClose}>Done</button>
        </header>
        <p className="lead">
          People who aren’t your friends can send a few text messages first. They won’t see when you read them, and
          they aren’t told if you delete a request.
        </p>
        {error && <p className="form-error">{error}</p>}

        {requests.length === 0 && accepted.length === 0 ? (
          <div className="req-empty">
            <span className="empty-icon"><Icon name="inbox" size={24} /></span>
            <p>No message requests right now.</p>
          </div>
        ) : (
          <ul className="req-list">
            {accepted.map(([id, name]) => (
              <li key={id} className="req-done">
                <Icon name="check" size={16} /> <span>You accepted {name}.</span>
                <button className="primary small" onClick={() => onOpen(id)}>Open chat</button>
              </li>
            ))}
            {requests.map((r) => {
              const u = r.user;
              return (
                <li key={r.id} className="req-card">
                  <div className="req-who">
                    <button className="person-btn" onClick={() => onProfile(u)} aria-label={`View ${u.name}'s profile`}>
                      <Avatar user={u} size={42} online={u.online} />
                      <span className="people-name">
                        <span>
                          {u.name}
                          {u.pronouns && <span className="pronoun-tag">{u.pronouns}</span>}
                        </span>
                        <small>{u.bio ? u.bio.slice(0, 70) : 'No bio yet'}</small>
                      </span>
                    </button>
                    {r.last && <time>{fmtStamp(r.last.ts)}</time>}
                  </div>
                  <div className="req-msgs">
                    {r.messages.map((m) => (
                      <p key={m.id} className="req-bubble">{stripMarks(m.text) || '…'}</p>
                    ))}
                  </div>
                  <div className="req-actions">
                    <button
                      className="primary small"
                      disabled={busy === r.id}
                      onClick={() => run(r.id, () => onAccept(u.id), () => setDone((d) => ({ ...d, [r.id]: u.name })))}
                    >
                      Accept
                    </button>
                    <button className="secondary small" disabled={busy === r.id} onClick={() => run(r.id, () => onDecline(u.id))}>
                      Delete
                    </button>
                    <button className="text-btn" onClick={() => onOpen(r.id)}>Open</button>
                    <button
                      className="text-btn danger-text"
                      onClick={() => {
                        if (window.confirm(`Block ${u.name}? They won’t be able to message you again, and this request goes away.`)) {
                          run(r.id, () => onBlock(u));
                        }
                      }}
                    >
                      <Icon name="ban" size={14} /> Block
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {outgoing.length > 0 && (
          <section>
            <h3 className="sub">Waiting for a reply</h3>
            <ul className="people rows">
              {outgoing.map((o) => (
                <li key={o.id} className="person-row">
                  <button className="person-btn" onClick={() => onOpen(o.id)}>
                    <Avatar user={o.user} size={34} online={o.user.online} />
                    <span className="people-name">
                      <span>{o.user.name}</span>
                      <small>{o.left > 0 ? `${o.left} ${o.left === 1 ? 'message' : 'messages'} left until they accept` : 'Waiting for them to accept'}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
