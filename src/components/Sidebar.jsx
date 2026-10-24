import { useEffect, useRef, useState } from 'react';
import { toast, confetti } from '../toast.js';
import Avatar from './Avatar.jsx';
import Logo from './Logo.jsx';
import Icon from './Icon.jsx';
import RoomGlyph from './RoomGlyph.jsx';
import { GROUP_ICONS } from '../constants.js';
import { dmId } from '../useParley.js';
import { stripMarks } from '../richText.jsx';
import Emoji from '../Emoji.jsx';

const previewOf = (list, meId) => {
  const last = list?.[list.length - 1];
  if (!last) return '';
  const body = last.deleted
    ? 'Message deleted'
    : stripMarks(last.text) || (last.poll ? 'Poll: ' + last.poll.question : last.image ? 'Photo' : '');
  return (last.user.id === meId ? 'You: ' : '') + body;
};

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '');

function Welcome({ me, friendCount, hasSent, onProfile, onFriend, onSay }) {
  const key = `parley:welcome:${me.id}`;
  const [gone, setGone] = useState(() => {
    try { return !!localStorage.getItem(key); } catch { return false; }
  });
  const steps = [
    { label: 'Make it yours', hint: 'Add a bio, pronouns or a status', done: !!(me.bio || me.status || me.pronouns), go: onProfile },
    { label: 'Add a friend', hint: 'Find someone by username', done: friendCount > 0, go: onFriend },
    { label: 'Say hello', hint: 'Send your first message', done: hasSent, go: onSay },
  ];
  const done = steps.filter((x) => x.done).length;
  const all = done === steps.length;
  const first = useRef(all); // already finished before this session: stay quiet
  const dismiss = (celebrate) => {
    try { localStorage.setItem(key, '1'); } catch {}
    setGone(true);
    if (celebrate) {
      confetti();
      toast('You’re all set. Enjoy Parley!', 'success');
    }
  };
  useEffect(() => {
    if (gone || !all) return;
    if (first.current) dismiss(false);
    else dismiss(true);
  }, [all, gone]);
  if (gone) return null;
  return (
    <section className="welcome" aria-label="Getting started">
      <div className="welcome-top">
        <strong>Getting started</strong>
        <span>{done}/{steps.length}</span>
        <button className="side-icon welcome-x" onClick={() => dismiss(false)} aria-label="Hide getting started" title="Hide">
          <Icon name="close" size={14} />
        </button>
      </div>
      <div className="welcome-bar"><i style={{ width: `${(done / steps.length) * 100}%` }} /></div>
      <ul>
        {steps.map((x) => (
          <li key={x.label}>
            <button type="button" className={x.done ? 'done' : ''} onClick={x.go} disabled={x.done}>
              <span className="welcome-dot">{x.done && <Icon name="check" size={12} />}</span>
              <span><b>{x.label}</b><small>{x.hint}</small></span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function Sidebar({
  me, rooms, people, friendIds, requestCount, messages, unread, active, status, starred, muted, anyUnread,
  onSelect, onCreateRoom, onLogout, onOpenSettings, onQuick, onMarkAllRead, onOpenFriends, onOpenDiscover,
}) {
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [roomError, setRoomError] = useState('');
  const [roomIcon, setRoomIcon] = useState('');
  const [roomPrivate, setRoomPrivate] = useState(false);
  const [roomMembers, setRoomMembers] = useState([]);
  const [shut, setShut] = useState({});
  const [onlyUnread, setOnlyUnread] = useState(false);
  const flip = (k) => setShut((c) => ({ ...c, [k]: !c[k] }));
  const q = query.trim().toLowerCase();

  const roomRows = rooms
    .filter((r) => r.name.includes(q))
    .map((r) => ({ kind: 'room', id: r.id, r, list: messages[r.id] }))
    .filter((x) => !onlyUnread || unread[x.id] > 0);

  const friendUsers = people.filter((u) => friendIds.includes(u.id));
  const personRows = people
    .filter((u) => u.id !== me.id && u.name.toLowerCase().includes(q))
    .map((u) => {
      const id = dmId(me.id, u.id);
      const list = messages[id];
      return { kind: 'dm', id, u, list, last: list?.[list.length - 1], closed: !friendIds.includes(u.id) };
    })
    .sort(
      (a, b) =>
        (b.last?.ts || 0) - (a.last?.ts || 0) ||
        Number(b.u.online) - Number(a.u.online) ||
        a.u.name.localeCompare(b.u.name)
    )
    .filter((x) => !onlyUnread || unread[x.id] > 0);

  const starredRows = [...roomRows, ...personRows].filter((x) => starred.includes(x.id));
  const rest = (rows) => rows.filter((x) => !starred.includes(x.id));

  const submitRoom = async (e) => {
    e.preventDefault();
    const res = await onCreateRoom({ name: roomName, icon: roomIcon, private: roomPrivate, members: roomMembers });
    if (res.error) return setRoomError(res.error);
    setRoomName('');
    setRoomIcon('');
    setRoomPrivate(false);
    setRoomMembers([]);
    setRoomError('');
    setAdding(false);
  };

  const row = (x) => {
    const n = unread[x.id] || 0;
    const isMuted = muted.includes(x.id);
    return (
      <li key={x.id}>
        <button
          className={`conv ${active === x.id ? 'active' : ''} ${n && !isMuted ? 'has-unread' : ''} ${isMuted ? 'muted' : ''}`}
          onClick={() => onSelect(x.id)}
          aria-current={active === x.id ? 'true' : undefined}
        >
          {x.kind === 'room' ? (
            <RoomGlyph room={x.r} />
          ) : (
            <Avatar user={x.u} size={36} online={x.u.online} />
          )}
          <span className="conv-text">
            <span className="conv-name">
              {x.kind === 'room' ? x.r.name : x.u.name}
              {x.kind === 'dm' && x.u.status?.emoji && <span className="conv-status"><Emoji char={x.u.status.emoji} /></span>}
            </span>
            <span className="conv-preview">
              {x.closed && !x.list?.length
                ? 'No longer friends'
                : previewOf(x.list, me.id) ||
                  (x.kind === 'room' ? x.r.topic : x.u.status?.text || (x.u.online ? 'Online' : 'Offline'))}
            </span>
          </span>
          {isMuted && <Icon name="bellOff" size={14} className="mute-mark" />}
          {n > 0 && <span className={isMuted ? 'badge quiet' : 'badge'}>{n}</span>}
        </button>
      </li>
    );
  };

  return (
    <aside className="sidebar">
      <header className="side-head">
        <Logo size={30} />
        <h2>parley</h2>
        <span
          className={`conn ${status}`}
          title={status === 'connected' ? 'Connected' : 'Reconnecting…'}
          role="status"
          aria-label={status === 'connected' ? 'Connected' : 'Reconnecting'}
        />
        <button
          className="side-icon"
          onClick={onMarkAllRead}
          disabled={!anyUnread}
          aria-label="Mark everything as read"
          title="Mark everything as read"
        >
          <Icon name="checks" />
        </button>
      </header>

      <button className="quick" onClick={onQuick}>
        <Icon name="search" size={16} />
        <span>Jump to…</span>
        <kbd>{isMac ? '⌘K' : 'Ctrl K'}</kbd>
      </button>

      <div className="search">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter the list"
          aria-label="Filter rooms and people"
        />
        <button
          type="button"
          className={onlyUnread ? 'unread-toggle on' : 'unread-toggle'}
          aria-pressed={onlyUnread}
          onClick={() => setOnlyUnread((v) => !v)}
          title="Show only conversations with unread messages"
        >
          Unread
        </button>
      </div>

      <Welcome
        me={me}
        friendCount={friendIds.length}
        hasSent={Object.values(messages).some((l) => l.some((m) => m.user.id === me.id && !m.pending))}
        onProfile={onOpenSettings}
        onFriend={() => onOpenFriends('add')}
        onSay={onQuick}
      />

      <div className="side-scroll">
        {starredRows.length > 0 && (
          <section>
            <div className="side-title">
              <h3>
                <button type="button" className={`side-fold ${shut.starred ? 'shut' : ''}`} onClick={() => flip('starred')} aria-expanded={!shut.starred}>
                  <Icon name="chevron" size={12} /> Starred
                </button>
              </h3>
            </div>
            {!shut.starred && <ul className="convs">{starredRows.map(row)}</ul>}
          </section>
        )}

        <section>
          <div className="side-title">
            <h3>
                <button type="button" className={`side-fold ${shut.rooms ? 'shut' : ''}`} onClick={() => flip('rooms')} aria-expanded={!shut.rooms}>
                  <Icon name="chevron" size={12} /> Rooms &amp; groups
                </button>
              </h3>
            <span className="title-actions">
              <button className="icon-btn" onClick={onOpenDiscover} aria-label="Browse public rooms" title="Browse public rooms">
                <Icon name="compass" size={15} />
              </button>
              <button
                className="icon-btn"
                onClick={() => setAdding((v) => !v)}
                aria-label="Create a room or private group"
                title="Create a room or group"
                aria-expanded={adding}
              >
                <Icon name={adding ? 'close' : 'plus'} size={15} />
              </button>
            </span>
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
              <div className="icon-row" role="radiogroup" aria-label="Group icon">
                {GROUP_ICONS.map((ic) => (
                  <button
                    type="button"
                    key={ic || 'hash'}
                    role="radio"
                    aria-checked={roomIcon === ic}
                    className={roomIcon === ic ? 'on' : ''}
                    onClick={() => setRoomIcon(ic)}
                  >
                    {ic ? <Emoji char={ic} /> : '#'}
                  </button>
                ))}
              </div>
              <label className="check dark">
                <input type="checkbox" checked={roomPrivate} onChange={(e) => setRoomPrivate(e.target.checked)} />
                Private group (invite only, friends)
              </label>
              {roomPrivate && (
                <div className="invite-list" role="group" aria-label="Invite people">
                  {friendUsers.length === 0 && <p className="side-empty">Add some friends first. You can invite them to this group later.</p>}
                  {friendUsers
                    .map((u) => (
                      <label key={u.id} className="check dark">
                        <input
                          type="checkbox"
                          checked={roomMembers.includes(u.id)}
                          onChange={(e) =>
                            setRoomMembers((cur) => (e.target.checked ? [...cur, u.id] : cur.filter((x) => x !== u.id)))
                          }
                        />
                        {u.name}
                      </label>
                    ))}
                </div>
              )}
              <button type="submit" disabled={!roomName.trim()}>
                {roomPrivate ? 'Create private group' : 'Create public room'}
              </button>
              {roomError && <p className="form-error">{roomError}</p>}
            </form>
          )}

          {!shut.rooms && <ul className="convs">{rest(roomRows).map(row)}</ul>}
          {q && roomRows.length === 0 && <p className="side-empty">No rooms match.</p>}
          {!q && rooms.length === 0 && (
            <p className="side-empty">
              You haven’t joined any rooms. <button className="link-btn on-dark" onClick={onOpenDiscover}>Browse public rooms</button>
            </p>
          )}
        </section>

        <section>
          <div className="side-title">
            <h3>
                <button type="button" className={`side-fold ${shut.friends ? 'shut' : ''}`} onClick={() => flip('friends')} aria-expanded={!shut.friends}>
                  <Icon name="chevron" size={12} /> Friends
                </button>
              </h3>
            <button
              className="icon-btn with-count"
              onClick={() => onOpenFriends(requestCount ? 'requests' : 'add')}
              aria-label={requestCount ? `Friends: ${requestCount} pending ${requestCount === 1 ? 'request' : 'requests'}` : 'Add a friend'}
              title={requestCount ? 'Friend requests' : 'Add a friend'}
            >
              <Icon name="userPlus" size={15} />
              {requestCount > 0 && <span className="dot-count">{requestCount}</span>}
            </button>
          </div>
          {requestCount > 0 && (
            <button className="request-note" onClick={() => onOpenFriends('requests')}>
              {requestCount} friend {requestCount === 1 ? 'request' : 'requests'} waiting
            </button>
          )}
          {personRows.length === 0 && (
            <p className="side-empty">
              {q ? (
                'Nobody matches that.'
              ) : (
                <>
                  No friends yet. <button className="link-btn on-dark" onClick={() => onOpenFriends('add')}>Add someone by username</button> to start chatting.
                </>
              )}
            </p>
          )}
          {!shut.friends && <ul className="convs">{rest(personRows).map(row)}</ul>}
        </section>
      </div>

      <footer className="side-foot">
        <button className="me-btn" onClick={onOpenSettings} aria-label="Open settings and profile">
          <Avatar user={me} size={34} online />
          <span className="me-text">
            <span className="me">{me.name}</span>
            <span className="me-status">
              {me.status ? <><Emoji char={me.status.emoji} /> {me.status.text}</> : 'Set a status'}
            </span>
          </span>
        </button>
        <button className="side-icon" onClick={onOpenSettings} aria-label="Settings" title="Settings">
          <Icon name="settings" />
        </button>
        <button className="side-icon" onClick={() => onOpenFriends('friends')} aria-label="Friends" title="Friends">
          <Icon name="users" />
        </button>
        <button className="side-icon" onClick={onLogout} aria-label="Log out" title="Log out">
          <Icon name="logout" />
        </button>
      </footer>
    </aside>
  );
}
