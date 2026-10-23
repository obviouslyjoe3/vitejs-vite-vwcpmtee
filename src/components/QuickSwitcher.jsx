import { useEffect, useMemo, useRef, useState } from 'react';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import { dmId } from '../useParley.js';
import { highlight, stripMarks } from '../richText.jsx';

// Ctrl/Cmd+K: jump to a room or person, or find a message anywhere.
export default function QuickSwitcher({ me, rooms, users, messages, onPick, onClose }) {
  const [q, setQ] = useState('');
  const [at, setAt] = useState(0);
  const list = useRef(null);
  const term = q.trim();
  const low = term.toLowerCase();

  const items = useMemo(() => {
    const convs = [
      ...rooms.map((r) => ({ kind: 'room', id: r.id, label: r.name, sub: r.topic })),
      ...users
        .filter((u) => u.id !== me.id)
        .map((u) => ({ kind: 'dm', id: dmId(me.id, u.id), label: u.name, sub: u.online ? 'Online' : 'Offline', user: u })),
    ].filter((c) => !low || c.label.toLowerCase().includes(low));

    const hits = [];
    if (low.length >= 2) {
      const names = Object.fromEntries([...rooms.map((r) => [r.id, '#' + r.name]), ...users.map((u) => [dmId(me.id, u.id), u.name])]);
      for (const [conv, msgs] of Object.entries(messages)) {
        if (!names[conv]) continue;
        for (const m of msgs) {
          const text = stripMarks(m.text || '');
          if (!m.deleted && text.toLowerCase().includes(low)) hits.push({ kind: 'msg', id: conv, msg: m, label: text, sub: `${m.user.name} in ${names[conv]}` });
        }
      }
      hits.sort((a, b) => b.msg.ts - a.msg.ts);
    }
    return [...convs.slice(0, 8), ...hits.slice(0, 8)];
  }, [low, rooms, users, messages, me.id]);

  useEffect(() => setAt(0), [q]);
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [at]);

  const key = (e) => {
    if (e.key === 'Escape') return onClose();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAt((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAt((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && items[at]) {
      e.preventDefault();
      const it = items[at];
      onPick(it.id, it.msg?.id);
    }
  };

  return (
    <div className="overlay top" onMouseDown={onClose}>
      <div className="switcher" role="dialog" aria-modal="true" aria-label="Jump to" onMouseDown={(e) => e.stopPropagation()}>
        <div className="switcher-input">
          <Icon name="search" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={key}
            placeholder="Jump to a room or person, or search messages"
            aria-label="Jump to"
            role="combobox"
            aria-expanded="true"
            aria-controls="switcher-list"
          />
        </div>
        <ul id="switcher-list" role="listbox" ref={list}>
          {items.length === 0 && <li className="switcher-empty">Nothing matches “{term}”.</li>}
          {items.map((it, i) => (
            <li
              key={it.kind + it.id + (it.msg?.id || '')}
              role="option"
              aria-selected={i === at}
              className={i === at ? 'on' : ''}
              onMouseEnter={() => setAt(i)}
              onClick={() => onPick(it.id, it.msg?.id)}
            >
              {it.kind === 'room' && <span className="room-glyph sm">#</span>}
              {it.kind === 'dm' && <Avatar user={it.user} size={26} online={it.user.online} />}
              {it.kind === 'msg' && <span className="room-glyph sm msg"><Icon name="search" size={13} /></span>}
              <span className="sw-text">
                <span className="sw-label">{it.kind === 'msg' ? highlight(it.label, term) : it.label}</span>
                <span className="sw-sub">{it.sub}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="switcher-foot">↑↓ to move · Enter to open · Esc to close</p>
      </div>
    </div>
  );
}
