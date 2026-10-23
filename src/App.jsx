import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParley } from './useParley.js';
import { loadPrefs, savePrefs, beep, showDesktop, askDesktopPermission } from './notify.js';
import Join from './components/Join.jsx';
import Sidebar from './components/Sidebar.jsx';
import Thread from './components/Thread.jsx';
import Settings from './components/Settings.jsx';
import QuickSwitcher from './components/QuickSwitcher.jsx';
import Logo from './components/Logo.jsx';
import {
  loadAppearance, saveAppearance, applyAppearance,
  loadConvPrefs, saveConvPrefs, loadDrafts, saveDraft,
} from './prefs.js';

const ago = (ts) => {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
};

export default function App() {
  const [view, setView] = useState('list'); // mobile only: 'list' | 'thread'
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [appearance, setAppearance] = useState(loadAppearance);
  const [prefs, setPrefs] = useState(loadPrefs);
  const [panel, setPanel] = useState(null); // null | 'info' | 'pins' | 'search'
  const [quickOpen, setQuickOpen] = useState(false);
  const [jump, setJump] = useState(null); // { conv, id }
  const [convPrefs, setConvPrefs] = useState({ starred: [], muted: [] });
  const drafts = useRef({});

  // Latest values for the socket callback (it must not be re-created each render)
  const live = useRef({});
  const onIncoming = useCallback((msg) => {
    const { me, prefs: pf } = live.current;
    if (!me || msg.user.id === me.id) return;
    const isDm = msg.room.startsWith('dm:');
    const mentioned =
      !!msg.text && msg.text.toLowerCase().includes('@' + me.name.toLowerCase());
    if (!isDm && !mentioned) return; // rooms stay quiet unless you are mentioned
    if (live.current.muted?.includes(msg.room) && !mentioned) return; // muted: only @mentions get through
    if (document.hasFocus() && !document.hidden && msg.room === live.current.active) return;
    if (pf.sound) beep();
    if (pf.desktop && document.hidden) {
      showDesktop(
        isDm ? msg.user.name : `${msg.user.name} mentioned you in #${msg.room}`,
        msg.text || (msg.poll ? 'Started a poll' : 'Sent an image')
      );
    }
  }, []);

  const p = useParley({ onIncoming });
  live.current = { me: p.me, active: p.active, prefs, muted: convPrefs.muted };

  // appearance: theme, accent, message style, text size
  useEffect(() => {
    applyAppearance(appearance);
    saveAppearance(appearance);
  }, [appearance]);

  // per-person lists and drafts, loaded once we know who you are
  const meId = p.me?.id;
  useEffect(() => {
    if (!meId) return;
    setConvPrefs(loadConvPrefs(meId));
    drafts.current = loadDrafts(meId);
  }, [meId]);

  const togglePref = (kind, id) => {
    if (!id || !meId) return;
    setConvPrefs((cur) => {
      const list = cur[kind].includes(id) ? cur[kind].filter((x) => x !== id) : [...cur[kind], id];
      const next = { ...cur, [kind]: list };
      saveConvPrefs(meId, next);
      return next;
    });
  };

  // unread count in the tab title (muted conversations stay out of it)
  const totalUnread = Object.entries(p.unread).reduce(
    (a, [id, n]) => (convPrefs.muted.includes(id) ? a : a + n),
    0
  );
  useEffect(() => {
    document.title = totalUnread ? `(${totalUnread}) Parley` : 'Parley';
  }, [totalUnread]);

  // Ctrl/Cmd+K opens the quick switcher
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setQuickOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const changePrefs = async (next) => {
    let value = next;
    if (next.desktop && !prefs.desktop) {
      value = { ...next, desktop: await askDesktopPermission() };
    }
    setPrefs(value);
    savePrefs(value);
  };

  const conv = useMemo(() => {
    if (!p.me || !p.active) return null;
    if (p.active.startsWith('dm:')) {
      const otherId = p.active.slice(3).split('|').find((x) => x !== p.me.id);
      const user = p.users.find((u) => u.id === otherId);
      if (!user) return null;
      return {
        id: p.active,
        kind: 'dm',
        title: user.name,
        subtitle: user.online
          ? 'Online now'
          : user.lastSeen
          ? `Last seen ${ago(user.lastSeen)}`
          : 'Offline',
        user,
      };
    }
    const room = p.rooms.find((r) => r.id === p.active);
    return room
      ? { id: room.id, kind: 'room', title: room.name, subtitle: room.topic, topic: room.topic }
      : null;
  }, [p.me, p.active, p.users, p.rooms]);

  if (p.restoring) {
    return (
      <main className="splash">
        <Logo size={56} />
        <p>Reconnecting…</p>
      </main>
    );
  }

  if (!p.me) return <Join status={p.status} error={p.error} onJoin={p.join} />;

  const typers = Object.keys(p.typing[p.active] || {})
    .filter((id) => id !== p.me.id)
    .map((id) => p.users.find((u) => u.id === id)?.name)
    .filter(Boolean);

  const select = (id, messageId) => {
    p.setActive(id);
    setView('thread');
    setQuickOpen(false);
    setJump(messageId ? { conv: id, id: messageId } : null);
  };

  const starred = convPrefs.starred.includes(p.active);
  const muted = convPrefs.muted.includes(p.active);

  return (
    <div className="shell" data-view={view}>
      <Sidebar
        me={p.me}
        rooms={p.rooms}
        users={p.users}
        messages={p.messages}
        unread={p.unread}
        active={p.active}
        status={p.status}
        starred={convPrefs.starred}
        muted={convPrefs.muted}
        anyUnread={Object.values(p.unread).some((n) => n > 0)}
        onSelect={select}
        onCreateRoom={p.createRoom}
        onLeave={p.leave}
        onOpenSettings={() => setSettingsOpen(true)}
        onQuick={() => setQuickOpen(true)}
        onMarkAllRead={p.markAllRead}
      />
      <Thread
        key={p.active || 'none'}
        conv={conv}
        me={p.me}
        users={p.users}
        messages={p.messages[p.active] || []}
        typers={typers}
        offline={p.status !== 'connected'}
        dividerTs={p.dividers[p.active] || null}
        jump={jump && jump.conv === p.active ? jump.id : null}
        onJumped={() => setJump(null)}
        draft={drafts.current[p.active] || ''}
        onDraft={(text) => {
          drafts.current[p.active] = text;
          saveDraft(p.me.id, p.active, text);
        }}
        panel={panel}
        onPanel={setPanel}
        starred={starred}
        muted={muted}
        onStar={() => togglePref('starred', p.active)}
        onMute={() => togglePref('muted', p.active)}
        onSetTopic={p.setTopic}
        onBack={() => setView('list')}
        onSend={(payload) => p.send(p.active, payload)}
        onTyping={() => p.sendTyping(p.active)}
        onReact={(id, emoji) => p.react(p.active, id, emoji)}
        onEdit={(id, text) => p.edit(p.active, id, text)}
        onDelete={(id) => p.remove(p.active, id)}
        onPin={(id) => p.pin(p.active, id)}
        onVote={(id, option) => p.vote(p.active, id, option)}
      />
      {settingsOpen && (
        <Settings
          me={p.me}
          appearance={appearance}
          prefs={prefs}
          onAppearance={setAppearance}
          onColor={p.updateColor}
          onStatus={p.updateStatus}
          onPrefs={changePrefs}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {quickOpen && (
        <QuickSwitcher
          me={p.me}
          rooms={p.rooms}
          users={p.users}
          messages={p.messages}
          onPick={select}
          onClose={() => setQuickOpen(false)}
        />
      )}
    </div>
  );
}
