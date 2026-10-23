import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { EMOJI, SHORTCODES, replaceShortcodes } from '../constants.js';


// Resize to max 1280px and re-encode as JPEG so messages stay small.
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Only images can be attached.'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const out = canvas.toDataURL('image/jpeg', 0.82);
      if (out.length > 2_800_000) reject(new Error('That image is too large to send.'));
      else resolve(out);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file could not be read as an image.'));
    };
    img.src = url;
  });
}

export default function Composer({
  placeholder, disabled, users, me, replyTo, draft = '', onDraft,
  onCancelReply, onSend, onTyping, onOpenPoll, onEditLast,
}) {
  const [text, setText] = useState(draft);
  const [image, setImage] = useState(null);
  const [note, setNote] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [mention, setMention] = useState(null); // { query, start, caret }
  const [short, setShort] = useState(null); // { query, start, caret } for :shortcodes
  const [pick, setPick] = useState(0);
  const box = useRef(null);
  const fileRef = useRef(null);
  const emojiRef = useRef(null);
  const lastTyping = useRef(0);

  useEffect(() => {
    if (replyTo) box.current?.focus();
  }, [replyTo]);

  useEffect(() => {
    requestAnimationFrame(grow);
  }, []);

  useEffect(() => {
    if (!emojiOpen) return;
    const close = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : !emojiRef.current?.contains(e.target)) setEmojiOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [emojiOpen]);

  const candidates = mention
    ? users
        .filter((u) => u.id !== me.id && u.name.toLowerCase().startsWith(mention.query.toLowerCase()))
        .slice(0, 5)
    : [];

  const shortCands = short
    ? Object.keys(SHORTCODES)
        .filter((k) => k.startsWith(short.query.toLowerCase()))
        .slice(0, 6)
    : [];
  const menuLen = candidates.length || shortCands.length;

  const grow = () => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  };

  const update = (value) => {
    setText(value);
    onDraft?.(value);
  };

  const canSend = !disabled && (text.trim() || image);

  const send = () => {
    if (!canSend) return;
    let out = text.trim();
    if (/^\/poll\s*$/i.test(out)) {
      update('');
      requestAnimationFrame(grow);
      return onOpenPoll?.();
    }
    if (/^\/shrug(\s|$)/i.test(out)) out = (out.slice(6).trim() + ' ¯\\_(ツ)_/¯').trim();
    onSend({ text: replaceShortcodes(out), image });
    update('');
    setImage(null);
    setNote('');
    setMention(null);
    setShort(null);
    setEmojiOpen(false);
    requestAnimationFrame(grow);
  };

  const attach = async (file) => {
    if (!file) return;
    setNote('');
    try {
      setImage(await fileToDataUrl(file));
    } catch (err) {
      setNote(err.message);
    }
  };

  const change = (e) => {
    const value = e.target.value;
    const caret = e.target.selectionStart;
    update(value);
    grow();

    const m = /(^|\s)@([^\s@]{0,24})$/.exec(value.slice(0, caret));
    setMention(m ? { query: m[2], start: caret - m[2].length - 1, caret } : null);
    const sc = /(^|\s):([a-z0-9_]{2,20})$/i.exec(value.slice(0, caret));
    setShort(sc && !m ? { query: sc[2], start: caret - sc[2].length - 1, caret } : null);
    setPick(0);

    const now = Date.now();
    if (value && now - lastTyping.current > 1500) {
      lastTyping.current = now;
      onTyping();
    }
  };

  const insertMention = (u) => {
    const before = text.slice(0, mention.start) + '@' + u.name + ' ';
    update(before + text.slice(mention.caret));
    setMention(null);
    requestAnimationFrame(() => {
      box.current?.focus();
      box.current?.setSelectionRange(before.length, before.length);
    });
  };

  const insertShort = (key) => {
    const emo = SHORTCODES[key] + ' ';
    const before = text.slice(0, short.start) + emo;
    update(before + text.slice(short.caret));
    setShort(null);
    requestAnimationFrame(() => {
      box.current?.focus();
      box.current?.setSelectionRange(before.length, before.length);
    });
  };

  const addEmoji = (emo) => {
    const el = box.current;
    const s = el?.selectionStart ?? text.length;
    const e = el?.selectionEnd ?? text.length;
    update(text.slice(0, s) + emo + text.slice(e));
    setEmojiOpen(false);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(s + emo.length, s + emo.length);
      grow();
    });
  };

  // wrap the selection (or place the caret between a pair of markers)
  const wrap = (mark) => {
    const el = box.current;
    if (!el) return;
    const s = el.selectionStart;
    const e = el.selectionEnd;
    const picked = text.slice(s, e);
    update(text.slice(0, s) + mark + picked + mark + text.slice(e));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + mark.length, s + mark.length + picked.length);
      grow();
    });
  };

  const keyDown = (e) => {
    if (menuLen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        return setPick((p) => (p + 1) % menuLen);
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        return setPick((p) => (p - 1 + menuLen) % menuLen);
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        return candidates.length
          ? insertMention(candidates[pick] || candidates[0])
          : insertShort(shortCands[pick] || shortCands[0]);
      }
      if (e.key === 'Escape') return candidates.length ? setMention(null) : setShort(null);
    }
    if (e.key === 'ArrowUp' && !text && !image && onEditLast) {
      e.preventDefault();
      return onEditLast();
    }
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      return wrap('**');
    }
    if (mod && e.key.toLowerCase() === 'i') {
      e.preventDefault();
      return wrap('_');
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="composer-wrap">
      {replyTo && (
        <div className="reply-bar">
          <span>
            Replying to <strong>{replyTo.user.name}</strong>:{' '}
            {replyTo.text ? replyTo.text.slice(0, 80) : replyTo.poll ? 'Poll' : 'Photo'}
          </span>
          <button className="icon-btn" onClick={onCancelReply} aria-label="Cancel reply">
            <Icon name="close" size={14} />
          </button>
        </div>
      )}

      {note && <p className="form-error composer-note">{note}</p>}

      <div className="composer">
        {candidates.length > 0 && (
          <ul className="mentions" role="listbox" aria-label="Mention someone">
            {candidates.map((u, i) => (
              <li key={u.id}>
                <button
                  role="option"
                  aria-selected={i === pick}
                  className={i === pick ? 'on' : ''}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertMention(u);
                  }}
                >
                  <span className="dot" style={{ background: u.color }} />
                  {u.name}
                </button>
              </li>
            ))}
          </ul>
        )}

        {shortCands.length > 0 && (
          <ul className="mentions" role="listbox" aria-label="Emoji suggestions">
            {shortCands.map((k, i) => (
              <li key={k}>
                <button
                  role="option"
                  aria-selected={i === pick}
                  className={i === pick ? 'on' : ''}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertShort(k);
                  }}
                >
                  <span className="emoji-pick">{SHORTCODES[k]}</span>
                  :{k}:
                </button>
              </li>
            ))}
          </ul>
        )}

        {image && (
          <div className="attach-preview">
            <img src={image} alt="Attachment preview" />
            <button className="text-btn" onClick={() => setImage(null)}>
              Remove image
            </button>
          </div>
        )}

        <textarea
          ref={box}
          value={text}
          rows={1}
          onChange={change}
          onKeyDown={keyDown}
          onPaste={(e) => {
            const file = [...e.clipboardData.files].find((f) => f.type.startsWith('image/'));
            if (file) {
              e.preventDefault();
              attach(file);
            }
          }}
          placeholder={disabled ? 'Reconnecting…' : placeholder}
          aria-label={placeholder}
          disabled={disabled}
        />

        <div className="composer-bar">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              attach(e.target.files[0]);
              e.target.value = '';
            }}
          />
          <button className="tool" onClick={() => fileRef.current?.click()} disabled={disabled} aria-label="Attach an image" title="Attach an image">
            <Icon name="clip" />
          </button>
          <div className="pop-anchor" ref={emojiRef}>
            <button className="tool" onClick={() => setEmojiOpen((v) => !v)} disabled={disabled} aria-label="Insert emoji" aria-expanded={emojiOpen} title="Emoji">
              <Icon name="smile" />
            </button>
            {emojiOpen && (
              <div className="emoji-grid">
                {EMOJI.map((e) => (
                  <button key={e} onClick={() => addEmoji(e)}>
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="tool" onClick={onOpenPoll} disabled={disabled} aria-label="Create a poll" title="Create a poll">
            <Icon name="poll" />
          </button>
          <span className="bar-sep" />
          <button className="tool" onClick={() => wrap('**')} disabled={disabled} aria-label="Bold" title="Bold (Ctrl+B)">
            <Icon name="bold" size={16} />
          </button>
          <button className="tool" onClick={() => wrap('_')} disabled={disabled} aria-label="Italic" title="Italic (Ctrl+I)">
            <Icon name="italic" size={16} />
          </button>
          <button className="tool" onClick={() => wrap('~~')} disabled={disabled} aria-label="Strikethrough" title="Strikethrough">
            <Icon name="strike" size={16} />
          </button>
          <button className="tool" onClick={() => wrap('`')} disabled={disabled} aria-label="Code" title="Code">
            <Icon name="code" size={16} />
          </button>
          <span className="bar-hint">Enter to send · Shift+Enter for a new line · ↑ edits your last message</span>
          <button className="send" onClick={send} disabled={!canSend} aria-label="Send message">
            <Icon name="send" size={16} /> Send
          </button>
        </div>
      </div>
    </div>
  );
}
