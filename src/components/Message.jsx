import { useState } from 'react';
import Avatar from './Avatar.jsx';

export const EMOJI = ['👍', '❤️', '😂', '🎉', '👀'];

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)"'])/g;

const renderText = (text) =>
  text.split(URL_RE).map((part, i) =>
    i % 2 === 1 ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer">
        {part}
      </a>
    ) : (
      part
    )
  );

const clock = (ts) =>
  new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export default function Message({ msg, me, grouped, showName, onReact }) {
  const [picking, setPicking] = useState(false);
  const mine = msg.user.id === me.id;
  const reactions = Object.entries(msg.reactions || {});
  const canReact = !msg.pending && !msg.failed;

  return (
    <div className={`msg ${mine ? 'mine' : ''} ${grouped ? 'grouped' : ''}`}>
      <div className="msg-side">{!mine && !grouped && <Avatar user={msg.user} size={34} />}</div>

      <div className="msg-main">
        {!grouped && (
          <div className="msg-meta">
            {!mine && showName && <strong>{msg.user.name}</strong>}
            <time>{clock(msg.ts)}</time>
          </div>
        )}

        <div className="bubble-row">
          <div className={`bubble ${msg.pending ? 'pending' : ''} ${msg.failed ? 'failed' : ''}`}>
            {renderText(msg.text)}
          </div>

          {canReact && (
            <div className="react-ui">
              <button
                className="react-btn"
                onClick={() => setPicking((v) => !v)}
                aria-label="Add a reaction"
                aria-expanded={picking}
              >
                ☺
              </button>
              {picking && (
                <div className="picker" role="menu">
                  {EMOJI.map((e) => (
                    <button
                      key={e}
                      role="menuitem"
                      onClick={() => {
                        onReact(msg.id, e);
                        setPicking(false);
                      }}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {msg.failed && <p className="msg-failed">Not delivered. Check your connection and try again.</p>}

        {reactions.length > 0 && (
          <div className="reactions">
            {reactions.map(([emoji, ids]) => (
              <button
                key={emoji}
                className={ids.includes(me.id) ? 'pill on' : 'pill'}
                aria-pressed={ids.includes(me.id)}
                onClick={() => onReact(msg.id, emoji)}
              >
                {emoji} {ids.length}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
