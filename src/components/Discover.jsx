import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import RoomGlyph from './RoomGlyph.jsx';

const people = (n) => `${n} ${n === 1 ? 'member' : 'members'}`;

// The public room directory: find a room, join it, or open one you are already in.
export default function Discover({ onBrowse, onJoin, onOpen, onClose }) {
  const [q, setQ] = useState('');
  const [rooms, setRooms] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const latest = useRef(0);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const load = async (term) => {
    const mine = ++latest.current;
    const res = await onBrowse(term);
    if (mine !== latest.current) return; // a newer search is on its way
    if (res.error) return setError(res.error);
    setError('');
    setRooms(res.rooms);
  };

  useEffect(() => {
    const t = setTimeout(() => load(q.trim()), q ? 200 : 0);
    return () => clearTimeout(t);
  }, [q]);

  const join = async (room) => {
    setBusyId(room.id);
    const res = await onJoin(room.id);
    setBusyId(null);
    if (res.error) return setError(res.error);
    onOpen(room.id);
  };

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="dialog wide" role="dialog" aria-modal="true" aria-labelledby="discover-title" onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <h2 id="discover-title">Browse rooms</h2>
          <button className="text-btn" onClick={onClose}>Done</button>
        </header>
        <p className="hint lead">Public rooms are open to everyone, but you only see their messages after you join. Private groups never show up here.</p>

        <div className="panel-search discover-search">
          <Icon name="search" size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search rooms by name or topic" aria-label="Search rooms" autoFocus />
        </div>

        {error && <p className="form-error">{error}</p>}

        {rooms === null ? (
          <p className="panel-empty">Loading rooms…</p>
        ) : rooms.length === 0 ? (
          <p className="panel-empty">{q ? `No public rooms match “${q}”.` : 'There are no public rooms yet. Create the first one from the sidebar.'}</p>
        ) : (
          <ul className="rooms-list">
            {rooms.map((r) => (
              <li key={r.id} className="room-row">
                <RoomGlyph room={r} className="big" />
                <span className="room-info">
                  <span className="room-name">
                    {r.name}
                    {r.official && <span className="owner-tag">Official</span>}
                  </span>
                  <span className="room-topic">{r.topic || 'No topic yet'}</span>
                  <small>
                    {people(r.count)}
                    {r.owner ? ` · by ${r.owner}` : ''}
                  </small>
                </span>
                {r.joined ? (
                  <button className="text-btn" onClick={() => onOpen(r.id)}>Open</button>
                ) : (
                  <button className="primary small" onClick={() => join(r)} disabled={busyId === r.id}>
                    {busyId === r.id ? 'Joining…' : 'Join'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
