import { useEffect, useRef, useState } from 'react';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import { PollView } from './Poll.jsx';
import { renderRich } from '../richText.jsx';
import { REACTIONS } from '../constants.js';
import Emoji from '../Emoji.jsx';
import { fmtClock, reducedMotion } from '../format.js';


const clock = (ts) => fmtClock(ts);

export const jumpTo = (id) => {
  const el = document.getElementById('m-' + id);
  if (!el) return false;
  el.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 1600);
  return true;
};

export default function Message({
  msg, me, author, grouped, mentionSrc, saved, nameOf, forceEdit,
  onReact, onReply, onEdit, onDelete, onPin, onVote, onSave, onProfile, onOpenImage, onEditStarted,
}) {
  const [picking, setPicking] = useState(false);
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [copied, setCopied] = useState(false);
  const toolsRef = useRef(null);

  // close popovers on an outside click or Escape
  useEffect(() => {
    if (!picking && !menu) return;
    const close = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : !toolsRef.current?.contains(e.target)) {
        setPicking(false);
        setMenu(false);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [picking, menu]);

  const mine = msg.user.id === me.id;
  const reactions = Object.entries(msg.reactions || {});
  const canAct = !msg.pending && !msg.failed && !msg.deleted;

  const startEdit = () => {
    setDraft(msg.text || '');
    setEditing(true);
    setMenu(false);
  };
  // Up-arrow in an empty composer asks the newest message of yours to open for editing
  useEffect(() => {
    if (forceEdit && canAct && !editing) {
      startEdit();
      onEditStarted?.();
    }
  }, [forceEdit]);
  const saveEdit = () => {
    const value = draft.trim();
    if (value && value !== msg.text) onEdit(msg.id, value);
    setEditing(false);
  };
  const remove = () => {
    setMenu(false);
    if (window.confirm('Delete this message for everyone?')) onDelete(msg.id);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(msg.text || msg.poll?.question || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
    setMenu(false);
  };

  const quote = msg.replyTo;

  return (
    <div
      id={'m-' + msg.id}
      className={`msg ${mine ? 'mine' : ''} ${grouped ? 'grouped' : ''} ${msg.pinned ? 'pinned' : ''}`}
    >
      <div className="msg-side">
        {!grouped && (
          <button className="who-btn" onClick={() => onProfile(author)} aria-label={`View ${author.name}'s profile`}>
            <Avatar user={author} size={34} />
          </button>
        )}
      </div>

      <div className="msg-main">
        {grouped && <time className="hover-time" aria-hidden="true">{clock(msg.ts)}</time>}
        {!grouped && (
          <div className="msg-meta">
            <button className="who-btn name" onClick={() => onProfile(author)}>
              <strong style={{ '--who': author.color }}>{mine ? 'You' : author.name}</strong>
            </button>
            {author.pronouns && <span className="pronoun-tag">{author.pronouns}</span>}
            <time>{clock(msg.ts)}</time>
            {saved && (
              <span className="pin-flag saved-flag" title="Saved by you">
                <Icon name="bookmark" size={12} /> Saved
              </span>
            )}
            {msg.pinned && (
              <span className="pin-flag" title={msg.pinnedBy ? `Pinned by ${msg.pinnedBy}` : 'Pinned'}>
                <Icon name="pin" size={12} /> Pinned
              </span>
            )}
          </div>
        )}

        {quote && (
          <button className="quote" onClick={() => jumpTo(quote.id)}>
            <strong>{quote.name}</strong>
            <span>
              {quote.deleted ? 'Deleted message' : quote.text || (quote.image ? 'Photo' : '')}
            </span>
          </button>
        )}

        <div className="bubble-row">
          {msg.deleted ? (
            <div className="bubble gone">This message was deleted</div>
          ) : editing ? (
            <div className="edit-box">
              <textarea
                autoFocus
                value={draft}
                rows={2}
                maxLength={2000}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    saveEdit();
                  }
                  if (e.key === 'Escape') setEditing(false);
                }}
                aria-label="Edit message"
              />
              <div className="edit-actions">
                <button onClick={saveEdit} disabled={!draft.trim()}>
                  Save
                </button>
                <button className="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div
              className={`bubble ${msg.pending ? 'pending' : ''} ${msg.failed ? 'failed' : ''} ${
                msg.image && !msg.text ? 'image-only' : ''
              } ${msg.action ? 'action' : ''} ${msg.poll ? 'has-poll' : ''}`}
            >
              {msg.image && (
                <img
                  className="shot"
                  src={msg.image}
                  alt="Shared image"
                  loading="lazy"
                  onClick={() => onOpenImage(msg.image)}
                />
              )}
              {msg.imageExpired && <p className="expired">Image no longer available</p>}
              {msg.poll && (
                <PollView
                  poll={msg.poll}
                  meId={me.id}
                  disabled={!canAct}
                  onVote={(opt) => onVote(msg.id, opt)}
                />
              )}
              {msg.text && (
                <div>
                  {msg.action && <span className="action-who">{author.name} </span>}
                  {renderRich(msg.text, mentionSrc, me.name)}
                </div>
              )}
              {msg.edited && <span className="edited">edited</span>}
            </div>
          )}

          {canAct && !editing && (
            <div className={picking || menu ? 'tools open' : 'tools'} ref={toolsRef}>
              <div className="pop-anchor">
                <button
                  className="tool"
                  onClick={() => {
                    setPicking((v) => !v);
                    setMenu(false);
                  }}
                  aria-label="Add a reaction"
                  title="React"
                  aria-expanded={picking}
                >
                  <Icon name="smile" size={16} />
                </button>
                {picking && (
                  <div className="picker" role="menu">
                    {REACTIONS.map((e) => (
                      <button
                        key={e}
                        role="menuitem"
                        onClick={() => {
                          onReact(msg.id, e);
                          setPicking(false);
                        }}
                      >
                        <Emoji char={e} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button className="tool" onClick={() => onReply(msg)} aria-label="Reply" title="Reply">
                <Icon name="reply" size={16} />
              </button>
              <div className="pop-anchor">
                <button
                  className="tool"
                  onClick={() => {
                    setMenu((v) => !v);
                    setPicking(false);
                  }}
                  aria-label="More actions"
                  title="More"
                  aria-expanded={menu}
                >
                  <Icon name="more" size={16} />
                </button>
                {menu && (
                  <div className="menu" role="menu">
                    <button role="menuitem" onClick={() => { onPin(msg.id); setMenu(false); }}>
                      <Icon name="pin" size={15} /> {msg.pinned ? 'Unpin message' : 'Pin to conversation'}
                    </button>
                    <button role="menuitem" onClick={() => { onSave(msg); setMenu(false); }}>
                      <Icon name="bookmark" size={15} /> {saved ? 'Remove from saved' : 'Save for later'}
                    </button>
                    {msg.text && (
                      <button role="menuitem" onClick={copy}>
                        <Icon name="copy" size={15} /> Copy text
                      </button>
                    )}
                    {mine && msg.text && !msg.poll && (
                      <button role="menuitem" onClick={startEdit}>
                        <Icon name="edit" size={15} /> Edit message
                      </button>
                    )}
                    {mine && (
                      <button role="menuitem" className="danger" onClick={remove}>
                        <Icon name="trash" size={15} /> Delete message
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {copied && <p className="msg-note">Copied</p>}
        {msg.failed && <p className="msg-failed">{msg.error || 'Not delivered. Check your connection and try again.'}</p>}

        {reactions.length > 0 && !msg.deleted && (
          <div className="reactions">
            {reactions.map(([emoji, ids]) => (
              <button
                key={emoji}
                className={ids.includes(me.id) ? 'pill on' : 'pill'}
                aria-pressed={ids.includes(me.id)}
                onClick={() => onReact(msg.id, emoji)}
                title={ids.map((id) => (id === me.id ? 'You' : nameOf?.(id) || 'Someone')).join(', ')}
              >
                <Emoji char={emoji} /> {ids.length}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
