import { useState } from 'react';
import Avatar from './Avatar.jsx';
import Logo from './Logo.jsx';
import { dmId } from '../useParley.js';

const previewOf = (list, meId) => {
  const last = list?.[list.length - 1];
  if (!last) return '';
  return (last.user.id === meId ? 'You: ' : '') + last.text;
};

export default function Sidebar({
  me, rooms, users, messages, unread, active, status, onSelect, onCreateRoom, onLeave,
}) {
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [roomError, setRoomError] = useState('');
  const q = query.trim().toLowerCase();

  const visibleRooms = rooms.filter((r) => r.name.includes(q));

  const people = users
    .filter((u) => u.id !== me.id && u.name.toLowerCase().includes(q))
    .map((u) => {
      const id = dmId(me.id, u.id);
      const list = messages[id];
      return { u, id, list, last: list?.[list.length - 1] };
    })
    .sort(
      (a, b) =>
        (b.last?.ts || 0) - (a.last?.ts || 0) ||
        Number(b.u.online) - Number(a.u.online) ||
        a.u.name.localeCompare(b.u.name)
    );

  const submitRoom = async (e) => {
    e.preventDefault();
    const res = await onCreateRoom(roomName);
    if (res.error) return setRoomError(res.error);
    setRoomName('');
    setRoomError('');
    setAdding(false);
  };

  return (
    <aside className="sidebar">
      <header className="side-head">
        <Logo size={30} />
        <h2>parley</h2>
        <span
          className={`conn ${status}`}
          title={status === 'connected' ? 'Connected' : 'Reconnecting…'}
        />
      </header>

      <div className="search">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search rooms and people"
          aria-label="Search rooms and people"
        />
      </div>

      <div className="side-scroll">
        <section>
          <div className="side-title">
            <h3>Rooms</h3>
            <button
              className="icon-btn"
              onClick={() => setAdding((v) => !v)}
              aria-label="Create a room"
              aria-expanded={adding}
            >
              {adding ? '×' : '+'}
            </button>
          </div>

          {adding && (
            <form className="new-room" onSubmit={submitRoom}>
              <input
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="Room name"
                maxLength={24}
                autoFocus
                aria-label="Room name"
              />
              <button type="submit" disabled={!roomName.trim()}>
                Create room
              </button>
              {roomError && <p className="form-error">{roomError}</p>}
            </form>
          )}

          <ul className="convs">
            {visibleRooms.map((r) => (
              <li key={r.id}>
                <button
                  className={`conv ${active === r.id ? 'active' : ''}`}
                  onClick={() => onSelect(r.id)}
                  aria-current={active === r.id ? 'true' : undefined}
                >
                  <span className="room-glyph">#</span>
                  <span className="conv-text">
                    <span className="conv-name">{r.name}</span>
                    <span className="conv-preview">
                      {previewOf(messages[r.id], me.id) || r.topic}
                    </span>
                  </span>
                  {unread[r.id] > 0 && <span className="badge">{unread[r.id]}</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <div className="side-title">
            <h3>People</h3>
          </div>
          {people.length === 0 && (
            <p className="side-empty">
              {q ? 'Nobody matches that search.' : 'Open this page in another tab or device to meet someone.'}
            </p>
          )}
          <ul className="convs">
            {people.map(({ u, id, list }) => (
              <li key={u.id}>
                <button
                  className={`conv ${active === id ? 'active' : ''}`}
                  onClick={() => onSelect(id)}
                  aria-current={active === id ? 'true' : undefined}
                >
                  <Avatar user={u} size={38} online={u.online} />
                  <span className="conv-text">
                    <span className="conv-name">{u.name}</span>
                    <span className="conv-preview">
                      {previewOf(list, me.id) || (u.online ? 'Online' : 'Offline')}
                    </span>
                  </span>
                  {unread[id] > 0 && <span className="badge">{unread[id]}</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <footer className="side-foot">
        <Avatar user={me} size={34} online />
        <span className="me">{me.name}</span>
        <button className="text-btn" onClick={onLeave}>
          Switch name
        </button>
      </footer>
    </aside>
  );
}
