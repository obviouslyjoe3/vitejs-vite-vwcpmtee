import { useLayoutEffect, useRef } from 'react';
import Message from './Message.jsx';
import Composer from './Composer.jsx';
import Avatar from './Avatar.jsx';

const GROUP_MS = 5 * 60 * 1000;

const dayLabel = (ts) => {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
};

export default function Thread({
  conv, me, messages, typers, offline, onBack, onSend, onTyping, onReact,
}) {
  const scroller = useRef(null);
  const stick = useRef(true);
  const lastConv = useRef(null);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const last = messages[messages.length - 1];
    const switched = lastConv.current !== conv?.id;
    lastConv.current = conv?.id;
    if (switched || stick.current || last?.user.id === me.id) {
      el.scrollTo({ top: el.scrollHeight, behavior: switched ? 'auto' : 'smooth' });
    }
  }, [messages.length, conv?.id, me.id]);

  if (!conv) {
    return (
      <section className="thread">
        <div className="thread-empty">
          <p>Choose a room or a person to start talking.</p>
        </div>
      </section>
    );
  }

  const typingText =
    typers.length === 0
      ? ''
      : typers.length === 1
      ? `${typers[0]} is typing…`
      : `${typers.slice(0, 2).join(' and ')} are typing…`;

  const rows = [];
  messages.forEach((m, i) => {
    const prev = messages[i - 1];
    const newDay = !prev || new Date(prev.ts).toDateString() !== new Date(m.ts).toDateString();
    if (newDay) rows.push(<div className="day" key={`d${m.id}`}><span>{dayLabel(m.ts)}</span></div>);
    const grouped = !newDay && prev.user.id === m.user.id && m.ts - prev.ts < GROUP_MS;
    rows.push(
      <Message
        key={m.id}
        msg={m}
        me={me}
        grouped={grouped}
        showName={conv.kind === 'room'}
        onReact={onReact}
      />
    );
  });

  return (
    <section className="thread">
      <header className="thread-head">
        <button className="back" onClick={onBack} aria-label="Back to conversations">
          ‹
        </button>
        {conv.kind === 'dm' ? (
          <Avatar user={conv.user} size={42} online={conv.user.online} />
        ) : (
          <span className="room-glyph big">#</span>
        )}
        <div className="thread-title">
          <h1>{conv.title}</h1>
          <p>{conv.subtitle}</p>
        </div>
      </header>

      {offline && (
        <div className="banner" role="status">
          Connection lost. Trying to reconnect…
        </div>
      )}

      <div
        className="messages"
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
        }}
        role="log"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <div className="thread-empty">
            <p>
              {conv.kind === 'dm'
                ? `This is the start of your conversation with ${conv.title}.`
                : `Nothing in #${conv.title} yet. Send the first message.`}
            </p>
          </div>
        ) : (
          rows
        )}
      </div>

      <div className="typing" aria-live="polite">{typingText}</div>

      <Composer
        key={conv.id}
        placeholder={conv.kind === 'dm' ? `Message ${conv.title}` : `Message #${conv.title}`}
        disabled={offline}
        onSend={onSend}
        onTyping={onTyping}
      />
    </section>
  );
}
