import { useEffect, useState } from 'react';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import Emoji from '../Emoji.jsx';
import { ago, fmtMonth } from '../format.js';

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
const SORTS = [
  ['online', 'Online first'],
  ['name', 'A to Z'],
  ['recent', 'Newest friends'],
];

export default function Friends({
  tab: startTab = 'friends', users, friends, incoming, outgoing,
  favorites = [], since = {}, reqTs = {},
  onRequest, onAccept, onDecline, onCancel, onRemove, onMessage, onProfile, onClose,
  onFavorite, onSuggestions, onRequestById,
}) {
  const [tab, setTab] = useState(startTab);
  const [name, setName] = useState('');
  const [note, setNote] = useState(null); // { ok, text }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('online');
  const [onlyOnline, setOnlyOnline] = useState(false);
  const [suggest, setSuggest] = useState(null); // null = loading, [] = none
  const [sent, setSent] = useState({}); // suggestion id -> true once a request went out

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
  const favSet = new Set(favorites);
  const q = query.trim().toLowerCase();
  const byName = (a, b) => a.name.localeCompare(b.name);
  const friendAll = list(friends);
  const friendList = friendAll
    .filter((u) => (!q || u.name.toLowerCase().includes(q)) && (!onlyOnline || u.online))
    .sort((a, b) => {
      const fav = Number(favSet.has(b.id)) - Number(favSet.has(a.id));
      if (fav) return fav;
      if (sort === 'name') return byName(a, b);
      if (sort === 'recent') return (since[b.id] || 0) - (since[a.id] || 0) || byName(a, b);
      return Number(b.online) - Number(a.online) || byName(a, b);
    });
  const onlineCount = friendAll.filter((u) => u.online).length;
  const inList = list(incoming).sort((a, b) => (reqTs[b.id] || 0) - (reqTs[a.id] || 0));
  const outList = list(outgoing).sort((a, b) => (reqTs[b.id] || 0) - (reqTs[a.id] || 0));

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

  // suggestions load when the Add tab opens
  useEffect(() => {
    if (tab !== 'add' || !onSuggestions) return;
    let live = true;
    onSuggestions().then((res) => live && setSuggest(res.list || []));
    return () => { live = false; };
  }, [tab, onSuggestions, friends.length, outgoing.length]);

  const bulk = async (fn, ids) => {
    for (const id of ids) await fn(id);
  };

  const addSuggested = async (u) => {
    const res = await onRequestById(u.id);
    if (res.error) return setNote({ ok: false, text: res.error });
    setSent((s) => ({ ...s, [u.id]: true }));
    setNote({ ok: true, text: res.accepted ? `You and ${res.name} are now friends.` : `Request sent to ${res.name}.` });
  };

  const TABS = [
    ['friends', 'Friends', friendAll.length],
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
            {friendAll.length === 0 ? (
              <p className="panel-empty">
                No friends yet. Use <button className="link-btn" onClick={() => setTab('add')}>Add friend</button> to send a request by username.
              </p>
            ) : (
              <>
                <div className="friend-tools">
                  <input
                    className="field"
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={`Search ${friendAll.length} ${friendAll.length === 1 ? 'friend' : 'friends'}`}
                    aria-label="Search friends"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <select className="field" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort friends">
                    {SORTS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                  </select>
                </div>
                <div className="chip-row">
                  <button className={`chip-btn ${onlyOnline ? 'on' : ''}`} aria-pressed={onlyOnline} onClick={() => setOnlyOnline((v) => !v)}>
                    Online ({onlineCount})
                  </button>
                  {favorites.length > 0 && <span className="pill-note">{favorites.length} favorite{favorites.length === 1 ? '' : 's'}</span>}
                </div>
                {friendList.length === 0 ? (
                  <p className="panel-empty tight">No friends match.</p>
                ) : (
                  <ul className="people rows">
                    {friendList.map((u) => {
                      const fav = favSet.has(u.id);
                      const base = subOf(u);
                      return (
                        <Row
                          key={u.id}
                          user={u}
                          sub={since[u.id] ? <>{base} <span className="dim">· friends since {fmtMonth(since[u.id])}</span></> : base}
                          onOpen={() => onProfile(u)}
                        >
                          <button
                            className={`fav-btn ${fav ? 'on' : ''}`}
                            onClick={() => run(onFavorite(u.id))}
                            aria-pressed={fav}
                            aria-label={fav ? `Remove ${u.name} from favorites` : `Add ${u.name} to favorites`}
                            title={fav ? 'Favorite' : 'Add to favorites'}
                          >
                            <Icon name="star" size={16} />
                          </button>
                          <button className="text-btn" onClick={() => onMessage(u)}>
                            <Icon name="send" size={14} /> Message
                          </button>
                          <button className="text-btn danger-text" onClick={() => remove(u)}>Remove</button>
                        </Row>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
          </section>
        )}

        {tab === 'requests' && (
          <section>
            <div className="h3-row">
              <h3>Wants to be your friend</h3>
              {inList.length > 1 && (
                <span className="row-actions">
                  <button className="text-btn" onClick={() => run(bulk(onAccept, inList.map((u) => u.id)).then(() => ({})))}>Accept all</button>
                  <button
                    className="text-btn"
                    onClick={() => window.confirm(`Decline all ${inList.length} requests?`) && run(bulk(onDecline, inList.map((u) => u.id)).then(() => ({})))}
                  >
                    Decline all
                  </button>
                </span>
              )}
            </div>
            {inList.length === 0 ? (
              <p className="panel-empty tight">No requests waiting.</p>
            ) : (
              <ul className="people rows">
                {inList.map((u) => (
                  <Row key={u.id} user={u} sub={reqTs[u.id] ? `Sent you a request ${ago(reqTs[u.id])}` : 'Sent you a request'} onOpen={() => onProfile(u)}>
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
                  <Row key={u.id} user={u} sub={reqTs[u.id] ? `Request sent ${ago(reqTs[u.id])}` : 'Request sent'} onOpen={() => onProfile(u)}>
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
            {onSuggestions && (
              <>
                <h3 className="sub">People you may know</h3>
                {suggest === null ? (
                  <p className="panel-empty tight">Looking…</p>
                ) : suggest.length === 0 ? (
                  <p className="panel-empty tight">No suggestions right now. They show up when your friends know people you don’t, or you share a private group.</p>
                ) : (
                  <ul className="people rows">
                    {suggest.map((u) => (
                      <Row
                        key={u.id}
                        user={u}
                        sub={[
                          u.mutual ? `${u.mutual} mutual friend${u.mutual === 1 ? '' : 's'}` : '',
                          u.groups ? `${u.groups} shared group${u.groups === 1 ? '' : 's'}` : '',
                        ].filter(Boolean).join(' · ')}
                        onOpen={() => {}} // not connected yet, so there is no profile to open
                      >
                        {sent[u.id] || outgoing.includes(u.id) ? (
                          <span className="pill-note">Requested</span>
                        ) : (
                          <button className="primary small" onClick={() => addSuggested(u)}>Add</button>
                        )}
                      </Row>
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
