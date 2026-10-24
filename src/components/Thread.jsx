import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Message, { jumpTo } from './Message.jsx';
import Composer from './Composer.jsx';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import Panel from './Panel.jsx';
import RoomGlyph from './RoomGlyph.jsx';
import { PollDialog } from './Poll.jsx';
import { mentionSource } from '../richText.jsx';
import Emoji from '../Emoji.jsx';

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
  conv, me, users, friendUsers, messages, typers, offline, dividerTs, jump, draft, panel,
  starred, muted, saved, onSave, onOpenSaved, onProfile, onAddFriend,
  onEditRoom, onDeleteRoom, onInvite, onKick, onUnban, onLeaveRoom, onMembers,
  onDraft, onPanel, onStar, onMute, onSetTopic, onJumped,
  onBack, onSend, onTyping, onReact, onEdit, onDelete, onPin, onVote,
  hiddenCount = 0, onManageBlocked, onUnblock,
  sendKey = 'enter', shortcodes = true, spellcheck = true,
}) {
  const scroller = useRef(null);
  const stick = useRef(true);
  const lastConv = useRef(null);
  const [replyTo, setReplyTo] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [pollOpen, setPollOpen] = useState(false);
  const [away, setAway] = useState(false);
  const [fresh, setFresh] = useState(0);
  const [editId, setEditId] = useState(null);

  const byId = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);
  const mentionSrc = useMemo(() => mentionSource(users), [users]);
  const savedIds = useMemo(() => new Set(saved.map((x) => x.id)), [saved]);
  const nameOf = (id) => byId[id]?.name;
  const editLast = () => {
    const mine = [...messages].reverse().find((m) => m.user.id === me.id && m.text && !m.poll && !m.deleted && !m.pending && !m.failed);
    if (mine) setEditId(mine.id);
  };
  const pinCount = messages.filter((m) => m.pinned && !m.deleted).length;

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const last = messages[messages.length - 1];
    const switched = lastConv.current !== conv?.id;
    lastConv.current = conv?.id;
    if (switched) {
      const divider = document.getElementById('new-divider');
      if (divider && !jump) {
        el.scrollTop = Math.max(0, divider.offsetTop - 60);
      } else {
        el.scrollTo({ top: el.scrollHeight, behavior: 'auto' });
      }
      return;
    }
    if (stick.current || last?.user.id === me.id) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      setFresh(0);
    } else if (last) {
      setFresh((n) => n + 1);
    }
  }, [messages.length, conv?.id, me.id]);

  // jump to a message chosen elsewhere (quick switcher)
  useEffect(() => {
    if (!jump) return;
    const t = setTimeout(() => {
      jumpTo(jump);
      onJumped?.();
    }, 80);
    return () => clearTimeout(t);
  }, [jump]);

  const toLatest = () => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
    setFresh(0);
  };

  if (!conv) {
    return (
      <section className="thread">
        <div className="thread-main">
          <div className="thread-empty">
            <div className="empty-card">
              <span className="empty-icon"><Icon name="hash" size={26} /></span>
              <h2>Pick a conversation</h2>
              <p>Choose a room or a person from the sidebar, or press <kbd>Ctrl</kbd> <kbd>K</kbd> to jump anywhere.</p>
            </div>
          </div>
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
  let dividerDone = false;
  messages.forEach((m, i) => {
    const prev = messages[i - 1];
    const newDay = !prev || new Date(prev.ts).toDateString() !== new Date(m.ts).toDateString();
    if (newDay) rows.push(<div className="day" key={`d${m.id}`}><span>{dayLabel(m.ts)}</span></div>);
    if (m.system) {
      rows.push(
        <div className="notice" key={m.id} id={'m-' + m.id}>
          <span>{m.text}</span>
        </div>
      );
      return;
    }
    let showDivider = false;
    if (!dividerDone && dividerTs && m.ts > dividerTs && m.user.id !== me.id) {
      dividerDone = true;
      showDivider = true;
      rows.push(
        <div className="new-divider" id="new-divider" key="newdiv">
          <span>New</span>
        </div>
      );
    }
    const grouped =
      !newDay && !showDivider && !m.replyTo && !m.poll && !prev.poll && !prev.system && prev.user.id === m.user.id && m.ts - prev.ts < GROUP_MS;
    rows.push(
      <Message
        key={m.id}
        msg={m}
        me={me}
        author={byId[m.user.id] || m.user}
        grouped={grouped}
        mentionSrc={mentionSrc}
        saved={savedIds.has(m.id)}
        nameOf={nameOf}
        forceEdit={editId === m.id}
        onEditStarted={() => setEditId(null)}
        onSave={onSave}
        onProfile={onProfile}
        onReact={onReact}
        onReply={setReplyTo}
        onEdit={onEdit}
        onDelete={onDelete}
        onPin={onPin}
        onVote={onVote}
        onOpenImage={setLightbox}
      />
    );
  });

  const togglePanel = (mode) => onPanel(panel === mode ? null : mode);

  return (
    <section className={`thread ${panel ? 'with-panel' : ''}`}>
      <div className="thread-main">
        <header className="thread-head">
          <button className="back" onClick={onBack} aria-label="Back to conversations">
            <Icon name="back" size={22} />
          </button>
          {conv.kind === 'dm' ? (
            <Avatar user={conv.user} size={40} online={conv.user.online} />
          ) : (
            <RoomGlyph room={conv.room} className="big" />
          )}
          <div className="thread-title">
            <h1>{conv.title}</h1>
            <p>
              {conv.kind === 'dm' && conv.user.status ? (
                <>
                  <Emoji char={conv.user.status.emoji} /> {conv.user.status.text} · {conv.subtitle}
                </>
              ) : (
                conv.subtitle || 'No topic yet'
              )}
            </p>
          </div>
          <div className="head-tools">
            <button className={`tool ${starred ? 'lit' : ''}`} onClick={onStar} aria-pressed={starred} aria-label={starred ? 'Remove star' : 'Star conversation'} title={starred ? 'Remove star' : 'Star'}>
              <Icon name="star" />
            </button>
            <button className={`tool ${muted ? 'lit' : ''}`} onClick={onMute} aria-pressed={muted} aria-label={muted ? 'Unmute' : 'Mute conversation'} title={muted ? 'Unmute' : 'Mute'}>
              <Icon name={muted ? 'bellOff' : 'bell'} />
            </button>
            <button className={`tool ${panel === 'search' ? 'lit' : ''}`} onClick={() => togglePanel('search')} aria-label="Search this conversation" aria-pressed={panel === 'search'} title="Search">
              <Icon name="search" />
            </button>
            <button className={`tool pins-btn ${panel === 'saved' ? 'lit' : ''}`} onClick={() => togglePanel('saved')} aria-label={`Saved messages (${saved.length})`} aria-pressed={panel === 'saved'} title="Saved messages">
              <Icon name="bookmark" />
              {saved.length > 0 && <span className="count">{saved.length}</span>}
            </button>
            <button className={`tool pins-btn ${panel === 'pins' ? 'lit' : ''}`} onClick={() => togglePanel('pins')} aria-label={`Pinned messages (${pinCount})`} aria-pressed={panel === 'pins'} title="Pinned messages">
              <Icon name="pin" />
              {pinCount > 0 && <span className="count">{pinCount}</span>}
            </button>
            <button className={`tool ${panel === 'info' ? 'lit' : ''}`} onClick={() => togglePanel('info')} aria-label="Conversation details" aria-pressed={panel === 'info'} title="Details">
              <Icon name="info" />
            </button>
          </div>
        </header>

        {offline && (
          <div className="banner" role="status">
            Connection lost. Trying to reconnect…
          </div>
        )}

        <div className="messages-wrap">
          <div
            className="messages"
            ref={scroller}
            onScroll={(e) => {
              const el = e.currentTarget;
              const near = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
              stick.current = near;
              setAway((a) => (a === !near ? a : !near));
              if (near) setFresh(0);
            }}
            role="log"
            aria-live="polite"
          >
            {messages.length === 0 ? (
              <div className="thread-empty">
                <div className="empty-card">
                  <span className="empty-icon"><Icon name={conv.kind === 'dm' ? 'user' : 'hash'} size={26} /></span>
                  <h2>{conv.kind === 'dm' ? conv.title : `#${conv.title}`}</h2>
                  <p>
                    {conv.kind === 'dm'
                      ? `This is the start of your conversation with ${conv.title}.`
                      : 'Nothing here yet. Send the first message.'}
                  </p>
                </div>
              </div>
            ) : (
              rows
            )}
          </div>
          {away && (
            <button className="to-latest" onClick={toLatest}>
              <Icon name="down" size={16} />
              {fresh > 0 ? `${fresh} new ${fresh === 1 ? 'message' : 'messages'}` : 'Jump to latest'}
            </button>
          )}
        </div>

        {hiddenCount > 0 && (
          <p className="hidden-note" role="status">
            <Icon name="ban" size={13} /> {hiddenCount} {hiddenCount === 1 ? 'message' : 'messages'} from people you blocked {hiddenCount === 1 ? 'is' : 'are'} hidden.
            <button className="link-btn" onClick={onManageBlocked}>Manage</button>
          </p>
        )}
        <div className="typing" aria-live="polite">{typingText}</div>

        {conv.blocked ? (
          <div className="closed-note blocked" role="status">
            <p><Icon name="ban" size={15} /> You blocked {conv.title}. They can’t message you, and you can’t message them. Old messages stay readable.</p>
            <button className="secondary" onClick={() => onUnblock(conv.user)}>Unblock</button>
          </div>
        ) : conv.closed ? (
          <div className="closed-note" role="status">
            <p>
              You and {conv.title} aren’t friends, so you can’t send new messages here. Your old messages are still
              readable.
            </p>
            <button className="primary" onClick={() => onAddFriend(conv.user)}>Add friend</button>
          </div>
        ) : (
        <Composer
          placeholder={conv.kind === 'dm' ? `Message ${conv.title}` : `Message #${conv.title}`}
          disabled={offline}
          users={users}
          me={me}
          replyTo={replyTo}
          draft={draft}
          onDraft={onDraft}
          onCancelReply={() => setReplyTo(null)}
          onEditLast={editLast}
          onOpenPoll={() => setPollOpen(true)}
          onSend={(payload) => {
            onSend({ ...payload, replyTo });
            setReplyTo(null);
          }}
          onTyping={onTyping}
          sendKey={sendKey}
          shortcodes={shortcodes}
          spellcheck={spellcheck}
        />
        )}
      </div>

      {panel && (
        <Panel
          mode={panel}
          conv={conv}
          me={me}
          users={users}
          friendUsers={friendUsers}
          messages={messages}
          starred={starred}
          muted={muted}
          onStar={onStar}
          onMute={onMute}
          onSetTopic={onSetTopic}
          onJump={(id) => {
            jumpTo(id);
            if (window.matchMedia('(max-width: 900px)').matches) onPanel(null);
          }}
          onUnpin={onPin}
          saved={saved}
          onOpenSaved={(item) => {
            onOpenSaved(item);
            if (window.matchMedia('(max-width: 900px)').matches) onPanel(null);
          }}
          onRemoveSaved={onSave}
          onProfile={onProfile}
          onEditRoom={onEditRoom}
          onDeleteRoom={onDeleteRoom}
          onInvite={onInvite}
          onKick={onKick}
          onUnban={onUnban}
          onLeaveRoom={onLeaveRoom}
          onMembers={onMembers}
          onClose={() => onPanel(null)}
        />
      )}

      {pollOpen && (
        <PollDialog
          onClose={() => setPollOpen(false)}
          onCreate={(poll) => {
            onSend({ text: '', poll, replyTo });
            setReplyTo(null);
            setPollOpen(false);
          }}
        />
      )}

      {lightbox && (
        <div
          className="lightbox"
          role="dialog"
          aria-label="Image preview"
          tabIndex={-1}
          ref={(el) => el?.focus()}
          onClick={() => setLightbox(null)}
          onKeyDown={(e) => e.key === 'Escape' && setLightbox(null)}
        >
          <img src={lightbox} alt="Shared image, full size" />
        </div>
      )}
    </section>
  );
}
