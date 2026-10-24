import { useEffect, useMemo, useRef, useState } from 'react';
import Avatar from './Avatar.jsx';
import RoomGlyph from './RoomGlyph.jsx';
import Icon from './Icon.jsx';
import { stripMarks } from '../richText.jsx';

// Pick where to send a copy of a message. Only places you can write to are listed.
export default function ForwardDialog({ msg, rooms, people, onPick, onClose }) {
  const [q, setQ] = useState('');
  const input = useRef(null);
  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const term = q.trim().toLowerCase();
  const items = useMemo(
    () => [
      ...rooms.map((r) => ({ id: r.id, kind: 'room', label: r.name, room: r })),
      ...people.map((p) => ({ id: p.dmId, kind: 'dm', label: p.user.name, user: p.user })),
    ].filter((x) => !term || x.label.toLowerCase().includes(term)),
    [rooms, people, term]
  );

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="dialog forward" role="dialog" aria-modal="true" aria-labelledby="forward-title" onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <h2 id="forward-title">Forward message</h2>
          <button className="text-btn" onClick={onClose}>Cancel</button>
        </header>
        <blockquote className="fwd-preview">
          <strong>{msg.user.name}</strong>
          <span>{stripMarks(msg.text) || (msg.image ? 'Photo' : '')}</span>
        </blockquote>
        <div className="panel-search">
          <Icon name="search" size={16} />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Send to…" aria-label="Search rooms and people" />
        </div>
        <ul className="fwd-list">
          {items.map((x) => (
            <li key={x.id}>
              <button className="person-btn" onClick={() => onPick(x.id, x.label)}>
                {x.kind === 'room' ? <RoomGlyph room={x.room} /> : <Avatar user={x.user} size={34} online={x.user.online} />}
                <span className="people-name">
                  <span>{x.kind === 'room' ? `#${x.label}` : x.label}</span>
                  <small>{x.kind === 'room' ? (x.room.private ? 'Private group' : 'Room') : 'Direct message'}</small>
                </span>
                <Icon name="forward" size={15} />
              </button>
            </li>
          ))}
          {items.length === 0 && <li className="panel-empty tight">Nothing matches “{q}”.</li>}
        </ul>
      </div>
    </div>
  );
}
