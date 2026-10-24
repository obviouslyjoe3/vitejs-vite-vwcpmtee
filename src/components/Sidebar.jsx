import { useEffect, useRef, useState } from 'react';
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

// "now", "4m", "3h", "2d" for the list; older than a week shows the date
const shortAgo = (ts) => {
  if (!ts) return '';
  const m = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const FILTERS = [
  ['all', 'All'],
  ['unread', 'Unread'],
  ['rooms', 'Rooms'],
  ['people', 'People'],
];

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '');

export default function Sidebar({
  me, rooms, people, friendIds, favoriteIds = [], requestCount, messages, unread, active, status, starred, muted, anyUnread,
  msgRequestCount = 0, pendingOut = [], onOpenRequests,
  drafts = {}, mentions = {}, dnd = { until: 0, paused: false }, onDnd,
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
  const [filter, setFilter] = useState('all'); // all | unread | rooms | people
  const flip = (k) => setShut((c) => ({ ...c, [k]: !c[k] }));
  const [dndOpen, setDndOpen] = useState(false);
  const [, bump] = useState(0);
  const dndRef = useRef(null);
  const dndOn = dnd.paused || dnd.until > Date.now();

  // re-draw when a timed pause runs out, so the moon stops glowing
  useEffect(() => {
    if (!dnd.until || dnd.until <= Date.now()) return undefined;
    const t = setTimeout(() => bump((n) => n + 1), Math.min(dnd.until - Date.now() + 250, 2147483000));
    return () => clearTimeout(t);
  }, [dnd.until]);

  useEffect(() => {
    if (!dndOpen) return undefined;
    const close = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : !dndRef.current?.contains(e.target)) setDndOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [dndOpen]);

  const pauseFor = (label, until) => {
    onDnd?.(until, label);
    setDndOpen(false);
  };
  const q = query.trim().toLowerCase();

  const roomRows = rooms
    .filter((r) => r.name.includes(q))
    .map((r) => ({ kind: 'room', id: r.id, r, list: messages[r.id] }))
    .filter((x) => filter !== 'unread' || unread[x.id] > 0);

  const friendUsers = people.filter((u) => friendIds.includes(u.id));
  const personRows = people
    .filter((u) => u.id !== me.id && u.name.toLowerCase().includes(q))
    .map((u) => {
      const id = dmId(me.id, u.id);
      const list = messages[id];
      return { kind: 'dm', id, u, list, last: list?.[list.length - 1], closed: !friendIds.includes(u.id), pending: pendingOut.includes(id) };
    })
    .sort(
      (a, b) =>
        (b.last?.ts || 0) - (a.last?.ts || 0) ||
        Number(b.u.online) - Number(a.u.online) ||
        a.u.name.localeCompare(b.u.name)
    )
    .filter((x) => filter !== 'unread' || unread[x.id] > 0);

  const onlineFriends = friendUsers
    .filter((u) => u.online && u.id !== me.id)
    .sort((a, b) => Number(favoriteIds.includes(b.id)) - Number(favoriteIds.includes(a.id)));

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
    const at = mentions[x.id] || 0;
    const hasDraft = !!drafts[x.id] && active !== x.id;
    const stamp = shortAgo(x.kind === 'room' ? x.list?.[x.list.length - 1]?.ts : x.last?.ts);
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
            <Avatar user={x.u} size={40} online={x.u.online} />
          )}
          <span className="conv-text">
            <span className="conv-top">
              <span className="conv-name">
                <span className="conv-label">{x.kind === 'room' ? x.r.name : x.u.name}</span>
                {x.kind === 'dm' && x.u.status?.emoji && <span className="conv-status"><Emoji char={x.u.status.emoji} /></span>}
                {x.pending && <span className="req-pill" title="Waiting for them to accept">Request</span>}
                {hasDraft && <span className="draft-pill" title="You have an unsent message here">Draft</span>}
              </span>
              {stamp && <time className="conv-time">{stamp}</time>}
            </span>
            <span className="conv-bottom">
              <span className="conv-preview">
                {x.closed && !x.list?.length
                  ? 'No longer friends'
                  : previewOf(x.list, me.id) ||
                    (x.kind === 'room' ? x.r.topic : x.u.status?.text || (x.u.online ? 'Online' : 'Offline'))}
              </span>
              <span className="conv-flags">
                {isMuted && <Icon name="bellOff" size={13} className="mute-mark" />}
                {at > 0 && !isMuted && (
                  <span className="at-badge" title={at === 1 ? 'You were mentioned' : `You were mentioned ${at} times`} aria-label={`${at} ${at === 1 ? 'mention' : 'mentions'}`}>@</span>
                )}
                {n > 0 && <span className={isMuted ? 'badge quiet' : 'badge'}>{n}</span>}
              </span>
            </span>
          </span>
        </button>
      </li>
    );
  };

  const showRooms = filter !== 'people';
  const showPeople = filter !== 'rooms';

  return (
    <aside className="sidebar">
      <nav className="rail" aria-label="Main">
        <span className="rail-logo" aria-hidden="true"><Logo size={34} /></span>
        <ul className="rail-nav">
          <li>
            <button className="rail-btn on" aria-current="page" onClick={() => document.querySelector('.side-scroll')?.scrollTo({ top: 0, behavior: 'smooth' })} title="Chats">
              <Icon name="send" size={22} />
              <span>Chats</span>
              {anyUnread && <i className="rail-dot" aria-label="Unread messages" />}
            </button>
          </li>
          <li>
            <button className="rail-btn" onClick={() => onOpenFriends(requestCount ? 'requests' : 'friends')} title="Friends">
              <Icon name="users" size={22} />
              <span>Friends</span>
              {requestCount > 0 && <b className="rail-count" aria-label={`${requestCount} friend requests`}>{requestCount}</b>}
            </button>
          </li>
          <li>
            <button className="rail-btn" onClick={onOpenRequests} title="Message requests">
              <Icon name="inbox" size={22} />
              <span>Requests</span>
              {msgRequestCount > 0 && <b className="rail-count" aria-label={`${msgRequestCount} message requests`}>{msgRequestCount}</b>}
            </button>
          </li>
          <li>
            <button className="rail-btn" onClick={onOpenDiscover} title="Browse public rooms">
              <Icon name="compass" size={22} />
              <span>Rooms</span>
            </button>
          </li>
        </ul>
        <div className="rail-end">
          <button
            className="rail-icon rail-extra"
            onClick={onMarkAllRead}
            disabled={!anyUnread}
            aria-label="Mark everything as read"
            title="Mark everything as read"
          >
            <Icon name="checks" size={20} />
          </button>
          <div className="dnd-anchor rail-extra" ref={dndRef}>
            <button
              className={dndOn ? 'rail-icon dnd-on' : 'rail-icon'}
              onClick={() => setDndOpen((v) => !v)}
              aria-expanded={dndOpen}
              aria-label={dndOn ? 'Alerts are paused' : 'Pause alerts'}
              title={dndOn ? 'Alerts are paused' : 'Pause alerts'}
            >
              <Icon name="moon" size={20} />
            </button>
            {dndOpen && (
              <div className="dnd-menu" role="menu" aria-label="Pause alerts">
                <p className="dnd-title">
                  {dnd.paused
                    ? 'Paused in Settings'
                    : dnd.until > Date.now()
                    ? `Paused until ${new Date(dnd.until).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                    : 'Pause alerts'}
                </p>
                {[
                  ['30 minutes', 30],
                  ['1 hour', 60],
                  ['4 hours', 240],
                ].map(([label, m]) => (
                  <button key={label} role="menuitem" onClick={() => pauseFor(label, Date.now() + m * 60000)}>
                    For {label}
                  </button>
                ))}
                <button
                  role="menuitem"
                  onClick={() => {
                    const d = new Date();
                    d.setDate(d.getDate() + (d.getHours() >= 9 ? 1 : 0));
                    d.setHours(9, 0, 0, 0);
                    pauseFor('tomorrow morning', d.getTime());
                  }}
                >
                  Until 9 am
                </button>
                {dnd.until > Date.now() && (
                  <button role="menuitem" className="resume" onClick={() => pauseFor('', 0)}>
                    Resume alerts now
                  </button>
                )}
                <small>Unread counts still update. Only sounds and desktop alerts are silenced.</small>
              </div>
            )}
          </div>
          <button className="rail-icon rail-extra" onClick={onLogout} aria-label="Log out" title="Log out">
            <Icon name="logout" size={20} />
          </button>
          <button className="rail-me" onClick={onOpenSettings} aria-label={`Settings and profile for ${me.name}`} title="Settings and profile">
            <Avatar user={me} size={38} online />
            <span>You</span>
          </button>
        </div>
      </nav>

      <div className="listcol">
        <header className="list-head">
          <h2>Chats</h2>
          <span
            className={`conn ${status}`}
            title={status === 'connected' ? 'Connected' : 'Reconnecting…'}
            role="status"
            aria-label={status === 'connected' ? 'Connected' : 'Reconnecting'}
          />
          <span className="list-head-end">
            <button
              className="list-icon"
              onClick={() => setAdding((v) => !v)}
              aria-label="Create a room or private group"
              title="Create a room or group"
              aria-expanded={adding}
            >
              <Icon name={adding ? 'close' : 'plus'} size={18} />
            </button>
          </span>
        </header>

        <div className="search">
          <Icon name="search" size={16} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter your chats"
            aria-label="Filter rooms and people"
          />
          <button type="button" className="quick" onClick={onQuick} title="Jump to any chat or message">
            <kbd>{isMac ? '⌘K' : 'Ctrl K'}</kbd>
          </button>
        </div>

        <div className="filters" role="group" aria-label="Show">
          {FILTERS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={filter === id ? 'on' : ''}
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
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
                {friendUsers.map((u) => (
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

        {onlineFriends.length > 0 && (
          <section className="online-strip" aria-label="Friends online now">
            <div className="online-head"><span className="online-dot" /> Online now <b>{onlineFriends.length}</b></div>
            <ul>
              {onlineFriends.slice(0, 10).map((u) => (
                <li key={u.id}>
                  <button type="button" onClick={() => onSelect(dmId(me.id, u.id))} title={`Message ${u.name}`} aria-label={`Message ${u.name}, online`}>
                    <Avatar user={u} size={38} online />
                    <span>{u.name}</span>
                  </button>
                </li>
              ))}
              {onlineFriends.length > 10 && <li className="online-more">+{onlineFriends.length - 10}</li>}
            </ul>
          </section>
        )}

        <div className="side-scroll">
          {filter === 'unread' && starredRows.length === 0 && roomRows.length === 0 && personRows.length === 0 && (
            <p className="side-empty">You’re all caught up.</p>
          )}

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

          {showRooms && (
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
                </span>
              </div>
              {!shut.rooms && <ul className="convs">{rest(roomRows).map(row)}</ul>}
              {q && roomRows.length === 0 && <p className="side-empty">No rooms match.</p>}
              {!q && filter === 'all' && rooms.length === 0 && (
                <p className="side-empty">
                  You haven’t joined any rooms. <button className="link-btn on-dark" onClick={onOpenDiscover}>Browse public rooms</button>
                </p>
              )}
            </section>
          )}

          {showPeople && (
            <section>
              <div className="side-title">
                <h3>
                  <button type="button" className={`side-fold ${shut.friends ? 'shut' : ''}`} onClick={() => flip('friends')} aria-expanded={!shut.friends}>
                    <Icon name="chevron" size={12} /> Friends
                  </button>
                </h3>
                <span className="title-actions">
                  <button
                    className="icon-btn"
                    onClick={() => onOpenFriends('add')}
                    aria-label="Add a friend"
                    title="Add a friend"
                  >
                    <Icon name="userPlus" size={15} />
                  </button>
                </span>
              </div>
              {msgRequestCount > 0 && (
                <button className="request-note msg" onClick={onOpenRequests}>
                  <Icon name="inbox" size={14} /> {msgRequestCount} message {msgRequestCount === 1 ? 'request' : 'requests'} from people you don’t know
                </button>
              )}
              {requestCount > 0 && (
                <button className="request-note" onClick={() => onOpenFriends('requests')}>
                  {requestCount} friend {requestCount === 1 ? 'request' : 'requests'} waiting
                </button>
              )}
              {personRows.length === 0 && filter !== 'unread' && (
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
          )}
        </div>
      </div>
    </aside>
  );
}
