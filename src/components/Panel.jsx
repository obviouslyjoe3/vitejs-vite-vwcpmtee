import { useEffect, useMemo, useRef, useState } from 'react';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import { highlight, stripMarks } from '../richText.jsx';

const when = (ts) =>
  new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

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

function InfoTab({ conv, users, me, starred, muted, onStar, onMute, onSetTopic }) {
  const [topic, setTopic] = useState(conv.topic || '');
  const [state, setState] = useState('');
  useEffect(() => setTopic(conv.topic || ''), [conv.topic]);

  const save = async (e) => {
    e.preventDefault();
    const res = await onSetTopic(conv.id, topic);
    setState(res.error || 'Saved');
    setTimeout(() => setState(''), 1500);
  };

  return (
    <div className="info">
      {conv.kind === 'dm' ? (
        <div className="info-person">
          <Avatar user={conv.user} size={64} online={conv.user.online} />
          <h3>{conv.user.name}</h3>
          <p>{conv.subtitle}</p>
          {conv.user.status && (
            <p className="status-line">
              {conv.user.status.emoji} {conv.user.status.text}
            </p>
          )}
        </div>
      ) : (
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
      )}

      <div className="info-block">
        <button className={`toggle-row ${starred ? 'on' : ''}`} onClick={onStar} aria-pressed={starred}>
          <Icon name="star" /> <span>{starred ? 'Starred. Shown at the top of your list' : 'Star to keep at the top of your list'}</span>
        </button>
        <button className={`toggle-row ${muted ? 'on' : ''}`} onClick={onMute} aria-pressed={muted}>
          <Icon name={muted ? 'bellOff' : 'bell'} />{' '}
          <span>{muted ? 'Muted. Only @mentions alert you' : 'Mute alerts and unread counts'}</span>
        </button>
      </div>

      {conv.kind === 'room' && (
        <div className="info-block">
          <h3 className="panel-h">
            People · {users.filter((u) => u.online).length} online of {users.length}
          </h3>
          <ul className="people">
            {[...users]
              .sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name))
              .map((u) => (
                <li key={u.id}>
                  <Avatar user={u} size={32} online={u.online} />
                  <span className="people-name">
                    {u.name}
                    {u.id === me.id && ' (you)'}
                    {u.status && (
                      <small>
                        {u.status.emoji} {u.status.text}
                      </small>
                    )}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const TITLES = { info: 'Details', pins: 'Pinned messages', search: 'Search' };

export default function Panel({ mode, conv, me, users, messages, starred, muted, onStar, onMute, onSetTopic, onJump, onUnpin, onClose }) {
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
        {mode === 'pins' && <PinsTab messages={messages} onJump={onJump} onUnpin={onUnpin} />}
        {mode === 'info' && (
          <InfoTab
            conv={conv}
            users={users}
            me={me}
            starred={starred}
            muted={muted}
            onStar={onStar}
            onMute={onMute}
            onSetTopic={onSetTopic}
          />
        )}
      </div>
    </aside>
  );
}
