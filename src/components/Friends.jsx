import { useEffect, useState } from 'react';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import Emoji from '../Emoji.jsx';

function Row({ user, sub, children, onOpen }) {
  return (
    <li className="person-row">
      <button className="person-btn" onClick={onOpen} aria-label={`View ${user.name}'s profile`}>
        <Avatar user={user} size={36} online={user.online} />
        <span className="people-name">
          <span>{user.name}</span>
          <small>{sub}</small>
        </span>
      </button>
      <span className="row-actions">{children}</span>
    </li>
  );
}

const subOf = (u) =>
  u.status ? (
    <>
      <Emoji char={u.status.emoji} /> {u.status.text}
    </>
  ) : u.online ? (
    'Online now'
  ) : (
    'Offline'
  );

// Friends, requests and "add by username" in one dialog.
export default function Friends({
  tab: startTab = 'friends', users, friends, incoming, outgoing,
  onRequest, onAccept, onDecline, onCancel, onRemove, onMessage, onProfile, onClose,
}) {
  const [tab, setTab] = useState(startTab);
  const [name, setName] = useState('');
  const [note, setNote] = useState(null); // { ok, text }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const byId = Object.fromEntries(users.map((u) => [u.id, u]));
  const list = (ids) =>
    ids
      .map((id) => byId[id])
      .filter(Boolean)
      .sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
  const friendList = list(friends);
  const inList = list(incoming);
  const outList = list(outgoing);

  const run = async (promise) => {
    const res = await promise;
    setError(res.error || '');
  };

  const add = async (e) => {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    const res = await onRequest(name.trim());
    setBusy(false);
    if (res.error) return setNote({ ok: false, text: res.error });
    setNote({
      ok: true,
      text: res.accepted ? `You and ${res.name} are now friends.` : `Request sent to ${res.name}.`,
    });
    setName('');
  };

  const remove = (u) => {
    if (window.confirm(`Remove ${u.name} from your friends? You can still read your old messages, but you won’t be able to send new ones.`)) {
      run(onRemove(u.id));
    }
  };

  const TABS = [
    ['friends', 'Friends', friendList.length],
    ['requests', 'Requests', inList.length],
    ['add', 'Add friend', 0],
  ];

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="dialog wide" role="dialog" aria-modal="true" aria-labelledby="friends-title" onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <h2 id="friends-title">Friends</h2>
          <button className="text-btn" onClick={onClose}>Done</button>
        </header>

        <div className="segmented tabs" role="tablist" aria-label="Friends">
          {TABS.map(([id, label, n]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => { setTab(id); setError(''); }}>
              {label}
              {id === 'requests' && n > 0 && <span className="badge tab-badge">{n}</span>}
            </button>
          ))}
        </div>

        {error && <p className="form-error">{error}</p>}

        {tab === 'friends' && (
          <section>
            {friendList.length === 0 ? (
              <p className="panel-empty">
                No friends yet. Use <button className="link-btn" onClick={() => setTab('add')}>Add friend</button> to send a request by username.
              </p>
            ) : (
              <ul className="people rows">
                {friendList.map((u) => (
                  <Row key={u.id} user={u} sub={subOf(u)} onOpen={() => onProfile(u)}>
                    <button className="text-btn" onClick={() => onMessage(u)}>
                      <Icon name="send" size={14} /> Message
                    </button>
                    <button className="text-btn danger-text" onClick={() => remove(u)}>Remove</button>
                  </Row>
                ))}
              </ul>
            )}
          </section>
        )}

        {tab === 'requests' && (
          <section>
            <h3>Wants to be your friend</h3>
            {inList.length === 0 ? (
              <p className="panel-empty tight">No requests waiting.</p>
            ) : (
              <ul className="people rows">
                {inList.map((u) => (
                  <Row key={u.id} user={u} sub="Sent you a request" onOpen={() => onProfile(u)}>
                    <button className="primary small" onClick={() => run(onAccept(u.id))}>Accept</button>
                    <button className="text-btn" onClick={() => run(onDecline(u.id))}>Decline</button>
                  </Row>
                ))}
              </ul>
            )}
            <h3 className="sub">Waiting for them</h3>
            {outList.length === 0 ? (
              <p className="panel-empty tight">You haven’t asked anyone.</p>
            ) : (
              <ul className="people rows">
                {outList.map((u) => (
                  <Row key={u.id} user={u} sub="Request sent" onOpen={() => onProfile(u)}>
                    <button className="text-btn" onClick={() => run(onCancel(u.id))}>Cancel</button>
                  </Row>
                ))}
              </ul>
            )}
          </section>
        )}

        {tab === 'add' && (
          <section>
            <form onSubmit={add} className="add-friend">
              <label className="field-label" htmlFor="friend-name">Their username</label>
              <div className="status-form">
                <input
                  id="friend-name"
                  className="field"
                  value={name}
                  onChange={(e) => { setName(e.target.value); setNote(null); }}
                  maxLength={21}
                  autoFocus
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="e.g. ada_l"
                />
                <button className="primary" type="submit" disabled={!name.trim() || busy}>Send request</button>
              </div>
              {note && <p className={note.ok ? 'saved' : 'form-error'} role="status">{note.text}</p>}
              <p className="hint">
                Parley has no public people list, so you need their exact username. You can also open anyone’s profile from a room and add them there.
              </p>
            </form>
          </section>
        )}
      </div>
    </div>
  );
}
