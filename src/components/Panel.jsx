import { useEffect, useMemo, useRef, useState } from 'react';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import { ProfileFacts } from './ProfileCard.jsx';
import { GROUP_ICONS } from '../constants.js';
import { highlight, stripMarks } from '../richText.jsx';
import Emoji from '../Emoji.jsx';
import { fmtStamp } from '../format.js';

const when = (ts) => fmtStamp(ts);

const snippet = (m) => stripMarks(m.text || (m.poll ? `Poll: ${m.poll.question}` : m.image ? 'Photo' : ''));

function Hit({ m, term, onJump, onUnpin }) {
  return (
    <li>
      <button className="hit" onClick={() => onJump(m.id)}>
        <span className="hit-meta">
          <strong style={{ '--who': m.user.color }}>{m.user.name}</strong>
          <time>{when(m.ts)}</time>
        </span>
        <span className="hit-text">{highlight(snippet(m), term)}</span>
      </button>
      {onUnpin && (
        <button className="text-btn unpin" onClick={() => onUnpin(m.id)}>
          Unpin
        </button>
      )}
    </li>
  );
}

function SearchTab({ messages, onJump }) {
  const [term, setTerm] = useState('');
  const input = useRef(null);
  useEffect(() => input.current?.focus(), []);
  const t = term.trim();
  const hits = useMemo(
    () =>
      t.length < 2
        ? []
        : messages
            .filter((m) => !m.deleted && snippet(m).toLowerCase().includes(t.toLowerCase()))
            .slice(-40)
            .reverse(),
    [messages, t]
  );
  return (
    <>
      <div className="panel-search">
        <Icon name="search" size={16} />
        <input
          ref={input}
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search this conversation"
          aria-label="Search this conversation"
        />
      </div>
      {t.length < 2 ? (
        <p className="panel-empty">Type at least two letters. Results show the newest matches first.</p>
      ) : hits.length === 0 ? (
        <p className="panel-empty">No messages match “{t}”.</p>
      ) : (
        <ul className="hits">
          {hits.map((m) => (
            <Hit key={m.id} m={m} term={t} onJump={onJump} />
          ))}
        </ul>
      )}
    </>
  );
}

function PinsTab({ messages, onJump, onUnpin }) {
  const pins = messages.filter((m) => m.pinned && !m.deleted).reverse();
  return pins.length === 0 ? (
    <p className="panel-empty">
      Nothing pinned yet. Open the ⋯ menu on any message and choose “Pin to conversation” to keep it handy.
    </p>
  ) : (
    <ul className="hits">
      {pins.map((m) => (
        <Hit key={m.id} m={m} onJump={onJump} onUnpin={onUnpin} />
      ))}
    </ul>
  );
}

function GroupManage({ room, onEditRoom }) {
  const [name, setName] = useState(room.name);
  const [icon, setIcon] = useState(room.icon || '');
  const [state, setState] = useState('');
  useEffect(() => {
    setName(room.name);
    setIcon(room.icon || '');
  }, [room.name, room.icon]);
  const dirty = name.trim().toLowerCase() !== room.name || icon !== (room.icon || '');
  const save = async (e) => {
    e.preventDefault();
    const res = await onEditRoom(room.id, { name, icon });
    setState(res.error || 'Saved');
    setTimeout(() => setState(''), 1800);
  };
  return (
    <form onSubmit={save} className="info-block">
      <h3 className="panel-h">Owner settings</h3>
      <label className="field-label" htmlFor="group-name">Name</label>
      <input id="group-name" className="field" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} />
      <label className="field-label spaced">Icon</label>
      <div className="icon-row light" role="radiogroup" aria-label="Group icon">
        {GROUP_ICONS.map((ic) => (
          <button type="button" key={ic || 'hash'} role="radio" aria-checked={icon === ic} className={icon === ic ? 'on' : ''} onClick={() => setIcon(ic)}>
            {ic ? <Emoji char={ic} /> : '#'}
          </button>
        ))}
      </div>
      <div className="inline-actions">
        <button className="primary" type="submit" disabled={!dirty || !name.trim()}>Save changes</button>
        {state && <span className={state === 'Saved' ? 'saved' : 'form-error inline'}>{state}</span>}
      </div>
    </form>
  );
}

function InfoTab({
  conv, users, friendUsers, me, starred, muted, onStar, onMute, onSetTopic, onExport,
  onProfile, onEditRoom, onDeleteRoom, onInvite, onKick, onUnban, onLeaveRoom, onMembers,
}) {
  const [topic, setTopic] = useState(conv.topic || '');
  const [state, setState] = useState('');
  const [error, setError] = useState('');
  const [listed, setListed] = useState({ users: [], total: 0 }); // public rooms: fetched from the server
  useEffect(() => setTopic(conv.topic || ''), [conv.topic]);

  const room = conv.room;
  const isOwner = !!room && room.owner === me.id;
  const canTopic = !!room && (room.private || isOwner);
  const ownerName = room?.owner ? users.find((u) => u.id === room.owner)?.name : null;
  const count = room?.count ?? room?.members?.length ?? 0;

  // A public room can have hundreds of people, so the server only sends the list when asked.
  useEffect(() => {
    if (!room || room.private) return undefined;
    let live = true;
    onMembers(room.id).then((res) => {
      if (live && res.users) setListed({ users: res.users, total: res.total });
    });
    return () => {
      live = false;
    };
  }, [room?.id, room?.private, count]);

  const members = room?.private ? users.filter((u) => room.members.includes(u.id)) : listed.users;
  const outsiders = room?.private ? friendUsers.filter((u) => !room.members.includes(u.id)) : [];

  const save = async (e) => {
    e.preventDefault();
    const res = await onSetTopic(conv.id, topic);
    setState(res.error || 'Saved');
    setTimeout(() => setState(''), 1500);
  };
  const run = async (promise) => {
    const res = await promise;
    setError(res.error || '');
  };
  const remove = () => {
    if (window.confirm(`Delete #${room.name} and all its messages for everyone? This cannot be undone.`)) run(onDeleteRoom(room.id));
  };
  const leave = () => {
    const how = room.private ? 'You will need an invite to come back.' : 'You can rejoin any time from Browse rooms.';
    if (window.confirm(`Leave #${room.name}? ${how}`)) run(onLeaveRoom(room.id));
  };
  const kick = (u) => {
    const text = room.private
      ? `Remove ${u.name} from #${room.name}?`
      : `Remove ${u.name} from #${room.name} and stop them from rejoining?`;
    if (window.confirm(text)) run(onKick(room.id, u.id));
  };

  return (
    <div className="info">
      {conv.kind === 'dm' ? (
        <div className="info-person">
          <Avatar user={conv.user} size={64} online={conv.user.online} />
          <h3>{conv.user.name}</h3>
          <p>{conv.subtitle}</p>
          <ProfileFacts user={conv.user} />
          <button className="text-btn" onClick={() => onProfile(conv.user)}>View full profile</button>
        </div>
      ) : (
        <>
          <div className="info-block group-head">
            <span className="kind-pill">
              <Icon name={room.private ? 'lock' : 'hash'} size={13} /> {room.private ? 'Private group' : 'Public room'}
            </span>
            <p className="group-meta">
              {`${count} ${count === 1 ? 'member' : 'members'}`}
              {room.private ? '' : ' · Anyone can join'}
              {ownerName && ` · Owner: ${ownerName}${room.owner === me.id ? ' (you)' : ''}`}
              {room.official && ' · Official room'}
              {room.createdAt ? ` · Created ${new Date(room.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
            </p>
          </div>

          {isOwner && <GroupManage room={room} onEditRoom={onEditRoom} />}

          {canTopic ? (
            <form onSubmit={save} className="info-block">
              <label className="field-label" htmlFor="topic">Topic</label>
              <input
                id="topic"
                className="field"
                value={topic}
                maxLength={120}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="What is this room for?"
              />
              <div className="inline-actions">
                <button className="primary" type="submit" disabled={topic.trim() === (conv.topic || '')}>
                  Save topic
                </button>
                {state && <span className="saved">{state}</span>}
              </div>
            </form>
          ) : (
            <div className="info-block">
              <h3 className="panel-h">Topic</h3>
              <p className="group-meta flat">{conv.topic || 'No topic yet'}</p>
            </div>
          )}
        </>
      )}

      <div className="info-block">
        <button className={`toggle-row ${starred ? 'on' : ''}`} onClick={onStar} aria-pressed={starred}>
          <Icon name="star" /> <span>{starred ? 'Starred. Shown at the top of your list' : 'Star to keep at the top of your list'}</span>
        </button>
        <button className={`toggle-row ${muted ? 'on' : ''}`} onClick={onMute} aria-pressed={muted}>
          <Icon name={muted ? 'bellOff' : 'bell'} />{' '}
          <span>{muted ? 'Muted. Only @mentions alert you' : 'Mute alerts and unread counts'}</span>
        </button>
        <button className="toggle-row" onClick={onExport}>
          <Icon name="download" /> <span>Export conversation as a text file</span>
        </button>
      </div>

      {conv.kind === 'room' && (
        <div className="info-block">
          <h3 className="panel-h">
            {`Members · ${members.filter((u) => (u.id === me.id ? true : u.online)).length} online${
              room.private || listed.total <= listed.users.length ? ` of ${members.length}` : ` of ${listed.total}`
            }`}
          </h3>
          <ul className="people">
            {[...members]
              .sort((a, b) => Number(b.id === room.owner) - Number(a.id === room.owner) || Number(b.online) - Number(a.online) || a.name.localeCompare(b.name))
              .map((u) => (
                <li key={u.id}>
                  <button className="person-btn" onClick={() => onProfile(u)} aria-label={`View ${u.name}'s profile`}>
                    <Avatar user={u} size={32} online={u.id === me.id ? true : u.online} />
                    <span className="people-name">
                      <span>
                        {u.name}
                        {u.id === me.id && ' (you)'}
                        {u.id === room.owner && <span className="owner-tag">Owner</span>}
                      </span>
                      {u.status ? (
                        <small><Emoji char={u.status.emoji} /> {u.status.text}</small>
                      ) : (
                        u.pronouns && <small>{u.pronouns}</small>
                      )}
                    </span>
                  </button>
                  {isOwner && u.id !== me.id && (
                    <button className="text-btn danger-text" onClick={() => kick(u)}>{room.private ? 'Remove' : 'Ban'}</button>
                  )}
                </li>
              ))}
          </ul>
          {!room.private && listed.total > listed.users.length && (
            <p className="panel-empty tight">Showing the first {listed.users.length} of {listed.total} people.</p>
          )}
        </div>
      )}

      {isOwner && !room.private && room.banned?.length > 0 && (
        <div className="info-block">
          <h3 className="panel-h">Banned from this room</h3>
          <ul className="people">
            {room.banned.map((b) => (
              <li key={b.id}>
                <span className="person-btn static">
                  <span className="people-name"><span>{b.name}</span></span>
                </span>
                <button className="text-btn" onClick={() => run(onUnban(room.id, b.id))}>Unban</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {room?.private && (
        <div className="info-block">
          <h3 className="panel-h">Add friends</h3>
          {outsiders.length === 0 ? (
            <p className="panel-empty tight">
              {friendUsers.length === 0
                ? 'You can add friends to a group. Add some from the Friends list first.'
                : 'All your friends are already in this group.'}
            </p>
          ) : (
            <ul className="people">
              {outsiders.map((u) => (
                <li key={u.id}>
                  <span className="person-btn static">
                    <Avatar user={u} size={32} online={u.online} />
                    <span className="people-name"><span>{u.name}</span></span>
                  </span>
                  <button className="text-btn" onClick={() => run(onInvite(room.id, [u.id]))}>Add</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && <p className="form-error">{error}</p>}

      {room && !isOwner && (
        <div className="info-block">
          <button className="toggle-row danger" onClick={leave}>
            <Icon name="logout" /> <span>Leave this {room.private ? 'group' : 'room'}</span>
          </button>
        </div>
      )}
      {isOwner && (
        <div className="info-block">
          <button className="toggle-row danger" onClick={remove}>
            <Icon name="trash" /> <span>Delete {room.private ? 'group' : 'room'} for everyone</span>
          </button>
        </div>
      )}
    </div>
  );
}

function SavedTab({ saved, users, onOpen, onRemove }) {
  const list = [...saved].sort((a, b) => b.savedAt - a.savedAt);
  const where = (room) =>
    room.startsWith('dm:')
      ? 'DM'
      : '#' + room;
  return list.length === 0 ? (
    <p className="panel-empty">
      Nothing saved yet. Open the ⋯ menu on any message and choose “Save for later”. Only you can see your saved messages, and they follow you across conversations.
    </p>
  ) : (
    <ul className="hits">
      {list.map((m) => (
        <li key={m.id}>
          <button className="hit" onClick={() => onOpen(m)}>
            <span className="hit-meta">
              <strong style={{ '--who': m.user.color }}>{users.find((u) => u.id === m.user.id)?.name || m.user.name}</strong>
              <time>{where(m.room)} · {when(m.ts)}</time>
            </span>
            <span className="hit-text">{m.text || 'Photo or poll'}</span>
          </button>
          <button className="text-btn unpin" onClick={() => onRemove(m)}>
            Remove
          </button>
        </li>
      ))}
    </ul>
  );
}

const exportChat = (conv, users, messages) => {
  const name = (m) => users.find((u) => u.id === m.user.id)?.name || m.user.name;
  const lines = messages
    .filter((m) => !m.deleted)
    .map((m) => {
      const when = new Date(m.ts).toLocaleString();
      const body = m.text || (m.poll ? `[poll] ${m.poll.question}` : m.image ? '[image]' : '');
      return `[${when}] ${name(m)}${m.action ? '' : ':'} ${body}${m.edited ? ' (edited)' : ''}`;
    });
  const title = conv.kind === 'dm' ? `Conversation with ${conv.title}` : `#${conv.title}`;
  const blob = new Blob([`${title}\nExported ${new Date().toLocaleString()}\n\n${lines.join('\n')}\n`], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `parley-${conv.kind === 'dm' ? 'dm-' : ''}${conv.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

const TITLES = { info: 'Details', pins: 'Pinned messages', search: 'Search', saved: 'Saved messages' };

export default function Panel({
  mode, conv, me, users, friendUsers, messages, starred, muted, saved, onStar, onMute, onSetTopic, onJump, onUnpin,
  onOpenSaved, onRemoveSaved, onProfile, onEditRoom, onDeleteRoom, onInvite, onKick, onUnban, onLeaveRoom, onMembers, onClose,
}) {
  return (
    <aside className="panel" aria-label={TITLES[mode]}>
      <header>
        <h2>{TITLES[mode]}</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Close panel">
          <Icon name="close" size={16} />
        </button>
      </header>
      <div className="panel-body">
        {mode === 'search' && <SearchTab key={conv.id} messages={messages} onJump={onJump} />}
        {mode === 'saved' && <SavedTab saved={saved} users={users} onOpen={onOpenSaved} onRemove={onRemoveSaved} />}
        {mode === 'pins' && <PinsTab messages={messages} onJump={onJump} onUnpin={onUnpin} />}
        {mode === 'info' && (
          <InfoTab
            conv={conv}
            users={users}
            friendUsers={friendUsers}
            me={me}
            starred={starred}
            muted={muted}
            onStar={onStar}
            onMute={onMute}
            onSetTopic={onSetTopic}
            onExport={() => exportChat(conv, users, messages)}
            onProfile={onProfile}
            onEditRoom={onEditRoom}
            onDeleteRoom={onDeleteRoom}
            onInvite={onInvite}
            onKick={onKick}
            onUnban={onUnban}
            onLeaveRoom={onLeaveRoom}
            onMembers={onMembers}
          />
        )}
      </div>
    </aside>
  );
}
