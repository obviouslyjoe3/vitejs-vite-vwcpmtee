import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParley, dmId } from './useParley.js';
import { loadPrefs, savePrefs, defaultPrefs, alertsSilenced, beep, showDesktop, askDesktopPermission } from './notify.js';
import Auth from './components/Auth.jsx';
import Sidebar from './components/Sidebar.jsx';
import Thread from './components/Thread.jsx';
import Settings from './components/Settings.jsx';
import QuickSwitcher from './components/QuickSwitcher.jsx';
import ProfileCard from './components/ProfileCard.jsx';
import Friends from './components/Friends.jsx';
import Discover from './components/Discover.jsx';
import Logo from './components/Logo.jsx';
import { QUIET_ROOMS } from './constants.js';
import Toaster from './components/Toaster.jsx';
import Confetti from './components/Confetti.jsx';
import { toast, confetti } from './toast.js';
import {
  loadAppearance, saveAppearance, applyAppearance, defaultAppearance, clearDrafts,
  loadConvPrefs, saveConvPrefs, loadDrafts, saveDraft, loadSaved, saveSaved,
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
  const [settingsSection, setSettingsSection] = useState('profile');
  const [appearance, setAppearance] = useState(loadAppearance);
  const [prefs, setPrefs] = useState(loadPrefs);
  const [panel, setPanel] = useState(null); // null | 'info' | 'pins' | 'search'
  const [quickOpen, setQuickOpen] = useState(false);
  const [profileUser, setProfileUser] = useState(null);
  const [friendsTab, setFriendsTab] = useState(null); // null | 'friends' | 'requests' | 'add'
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [jump, setJump] = useState(null); // { conv, id }
  const [convPrefs, setConvPrefs] = useState({ starred: [], muted: [] });
  const [saved, setSaved] = useState([]);
  const drafts = useRef({});

  // Latest values for the socket callback (it must not be re-created each render)
  const live = useRef({});
  const onIncoming = useCallback((msg) => {
    const { me, prefs: pf } = live.current;
    if (!me || msg.user.id === me.id) return;
    if (alertsSilenced(pf)) return; // paused or quiet hours
    const isDm = msg.room.startsWith('dm:');
    const mentioned =
      !!msg.text && msg.text.toLowerCase().includes('@' + me.name.toLowerCase());
    if (live.current.blockedIds?.includes(msg.user.id)) return; // blocked people never alert you
    if (QUIET_ROOMS.includes(msg.room) && !mentioned) return; // the global room never alerts
    if (live.current.muted?.includes(msg.room) && !mentioned) return; // muted: only @mentions get through
    if (pf.scope === 'mentions' && !mentioned) return;
    if (pf.scope !== 'all' && !isDm && !mentioned) return; // default: rooms stay quiet unless you are mentioned
    if (document.hasFocus() && !document.hidden && msg.room === live.current.active) return;
    if (pf.sound) beep(pf.volume);
    if (pf.desktop && document.hidden) {
      const what = msg.text || (msg.poll ? 'Started a poll' : 'Sent an image');
      const title = isDm
        ? msg.user.name
        : mentioned
        ? `${msg.user.name} mentioned you in #${msg.room}`
        : `${msg.user.name} in #${msg.room}`;
      showDesktop(title, pf.preview ? what : 'New message');
    }
  }, []);

  const onFriendRequest = useCallback((from) => {
    const { prefs: pf } = live.current;
    toast(`${from.name} sent you a friend request`);
    if (alertsSilenced(pf)) return;
    if (pf.sound) beep(pf.volume);
    if (pf.desktop && document.hidden) showDesktop(from.name, 'Sent you a friend request');
  }, []);

  const p = useParley({ onIncoming, onFriendRequest });
  const blockedIds = useMemo(() => p.blocked.map((b) => b.id), [p.blocked]);
  live.current = { ...live.current, me: p.me, active: p.active, prefs, muted: convPrefs.muted, blockedIds };

  // Room messages from people you blocked are hidden everywhere (DMs with them stay readable)
  const shownMessages = useMemo(() => {
    if (!blockedIds.length) return p.messages;
    const out = {};
    for (const [id, list] of Object.entries(p.messages)) {
      out[id] = id.startsWith('dm:') ? list : list.filter((m) => !blockedIds.includes(m.user?.id));
    }
    return out;
  }, [p.messages, blockedIds]);
  const hiddenCount = blockedIds.length && p.active && !p.active.startsWith('dm:')
    ? (p.messages[p.active] || []).length - (shownMessages[p.active] || []).length
    : 0;

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
    setSaved(loadSaved(meId));
  }, [meId]);

  const toggleSaved = (msg) => {
    if (!meId) return;
    toast(saved.some((x) => x.id === msg.id) ? 'Removed from saved' : 'Saved for later', 'success');
    setSaved((cur) => {
      const next = cur.some((x) => x.id === msg.id)
        ? cur.filter((x) => x.id !== msg.id)
        : [
            ...cur,
            {
              id: msg.id, room: msg.room, ts: msg.ts, savedAt: Date.now(),
              text: (msg.text || (msg.poll ? `Poll: ${msg.poll.question}` : '')).slice(0, 300),
              user: { id: msg.user.id, name: msg.user.name, color: msg.user.color },
            },
          ];
      saveSaved(meId, next);
      return next;
    });
  };

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
    document.title = totalUnread && prefs.title ? `(${totalUnread}) Parley` : 'Parley';
  }, [totalUnread, prefs.title]);

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

  // Alt+Up / Alt+Down switch conversation; Esc closes an open side panel
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && panel && !settingsOpen && !quickOpen && !profileUser && !friendsTab && !discoverOpen) {
        setPanel(null);
        return;
      }
      if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
      const ids = live.current.order || [];
      if (!ids.length) return;
      e.preventDefault();
      const at = ids.indexOf(live.current.active);
      const next = ids[(at + (e.key === 'ArrowDown' ? 1 : -1) + ids.length) % ids.length];
      if (next) {
        p.setActive(next);
        setView('thread');
        setJump(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const changePrefs = async (next) => {
    let value = next;
    if (next.desktop && !prefs.desktop) {
      value = { ...next, desktop: await askDesktopPermission() };
    }
    setPrefs(value);
    savePrefs(value);
  };

  const resetSettings = () => {
    setAppearance({ ...defaultAppearance });
    setPrefs({ ...defaultPrefs });
    savePrefs({ ...defaultPrefs });
  };
  const clearAllDrafts = () => {
    if (!meId) return;
    drafts.current = {};
    clearDrafts(meId);
  };
  const clearAllSaved = () => {
    if (!meId) return;
    setSaved([]);
    saveSaved(meId, []);
  };

  // People you can talk to: your friends, plus anyone you already have a DM with (read-only if no longer friends)
  const friendSet = useMemo(() => new Set(p.friends), [p.friends]);
  const people = useMemo(() => {
    if (!p.me) return [];
    const ids = new Set(p.friends);
    for (const key of Object.keys(p.messages)) {
      if (!key.startsWith('dm:')) continue;
      for (const id of key.slice(3).split('|')) if (id !== p.me.id) ids.add(id);
    }
    return p.users.filter((u) => ids.has(u.id) && !blockedIds.includes(u.id));
  }, [p.me, p.friends, p.messages, p.users, blockedIds]);

  live.current.order = p.me
    ? [...p.rooms.map((r) => r.id), ...people.filter((u) => u.id !== p.me.id).map((u) => dmId(p.me.id, u.id))]
    : [];

  // toasts for connection changes, blocking, and 🎉 moments
  const prevStatus = useRef(null);
  useEffect(() => {
    const was = prevStatus.current;
    prevStatus.current = p.status;
    if (!p.me || was === null) return;
    if (p.status === 'offline' && was !== 'offline') toast('You’re offline. Reconnecting…', 'error');
    if (p.status === 'connected' && was === 'offline') toast('Back online', 'success');
  }, [p.status, p.me]);

  const doBlock = async (u) => {
    const res = await p.blockUser(u.id);
    toast(res?.error || `Blocked ${u.name}`, res?.error ? 'error' : 'success');
    return res;
  };
  const doUnblock = async (idOrUser) => {
    const id = typeof idOrUser === 'string' ? idOrUser : idOrUser.id;
    const res = await p.unblockUser(id);
    toast(res?.error || 'Unblocked', res?.error ? 'error' : 'success');
    return res;
  };
  const doSend = (payload) => {
    if (/🎉|:tada:|\bcongrat/i.test(payload.text || '')) confetti();
    p.send(p.active, payload);
  };
  const doReact = (id, emoji) => {
    const msg = (p.messages[p.active] || []).find((m) => m.id === id);
    if (emoji === '🎉' && !(msg?.reactions?.[emoji] || []).includes(p.me.id)) confetti();
    p.react(p.active, id, emoji);
  };

  const relationOf = (id) =>
    friendSet.has(id) ? 'friends' : p.incoming.includes(id) ? 'incoming' : p.outgoing.includes(id) ? 'outgoing' : 'none';
  const friendUsers = useMemo(() => p.users.filter((u) => friendSet.has(u.id)), [p.users, friendSet]);

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
        closed: !friendSet.has(user.id),
        blocked: blockedIds.includes(user.id),
      };
    }
    const room = p.rooms.find((r) => r.id === p.active);
    if (!room) return null;
    const n = room.count ?? room.members?.length ?? 0;
    const subtitle = room.private
      ? `Private group · ${n} ${n === 1 ? 'member' : 'members'}${room.topic ? ' · ' + room.topic : ''}`
      : `${n} ${n === 1 ? 'member' : 'members'}${room.topic ? ' · ' + room.topic : ''}`;
    return { id: room.id, kind: 'room', title: room.name, subtitle, topic: room.topic, room };
  }, [p.me, p.active, p.users, p.rooms, friendSet, blockedIds]);

  if (p.restoring) {
    return (
      <main className="splash">
        <Logo size={56} />
        <p>Reconnecting…</p>
      </main>
    );
  }

  if (!p.me) return <Auth status={p.status} error={p.error} onLogin={p.login} onRegister={p.register} />;

  const typers = Object.keys(p.typing[p.active] || {})
    .filter((id) => id !== p.me.id && !blockedIds.includes(id))
    .map((id) => p.users.find((u) => u.id === id)?.name)
    .filter(Boolean);

  const select = (id, messageId) => {
    p.setActive(id);
    setView('thread');
    setQuickOpen(false);
    setJump(messageId ? { conv: id, id: messageId } : null);
  };

  const logout = async () => {
    setSettingsOpen(false);
    setFriendsTab(null);
    setDiscoverOpen(false);
    setProfileUser(null);
    setQuickOpen(false);
    setPanel(null);
    setView('list');
    await p.logout();
  };

  const starred = convPrefs.starred.includes(p.active);
  const muted = convPrefs.muted.includes(p.active);

  return (
    <div className="shell" data-view={view}>
      <Sidebar
        me={p.me}
        rooms={p.rooms}
        people={people}
        friendIds={p.friends}
        requestCount={p.incoming.length}
        messages={shownMessages}
        unread={p.unread}
        active={p.active}
        status={p.status}
        starred={convPrefs.starred}
        muted={convPrefs.muted}
        anyUnread={Object.values(p.unread).some((n) => n > 0)}
        onSelect={select}
        onCreateRoom={p.createRoom}
        onLogout={logout}
        onOpenFriends={(tab) => setFriendsTab(tab)}
        onOpenDiscover={() => setDiscoverOpen(true)}
        onOpenSettings={() => { setSettingsSection('profile'); setSettingsOpen(true); }}
        onQuick={() => setQuickOpen(true)}
        onMarkAllRead={p.markAllRead}
      />
      <Thread
        key={p.active || 'none'}
        conv={conv}
        me={p.me}
        users={p.users}
        friendUsers={friendUsers}
        messages={shownMessages[p.active] || []}
        hiddenCount={hiddenCount}
        onManageBlocked={() => { setSettingsSection('privacy'); setSettingsOpen(true); }}
        onUnblock={doUnblock}
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
        saved={saved}
        onSave={toggleSaved}
        onProfile={setProfileUser}
        onAddFriend={(u) => p.friendRequest(u.name)}
        onEditRoom={p.editRoom}
        onDeleteRoom={p.deleteRoom}
        onInvite={p.inviteToRoom}
        onKick={p.kickFromRoom}
        onUnban={p.unbanFromRoom}
        onMembers={p.roomMembers}
        onLeaveRoom={p.leaveRoom}
        onOpenSaved={(item) => select(item.room, item.id)}
        onStar={() => togglePref('starred', p.active)}
        onMute={() => togglePref('muted', p.active)}
        onSetTopic={p.setTopic}
        onBack={() => setView('list')}
        onSend={doSend}
        onTyping={() => prefs.typing && p.sendTyping(p.active)}
        sendKey={prefs.sendKey}
        shortcodes={prefs.shortcodes}
        spellcheck={prefs.spellcheck}
        onReact={doReact}
        onEdit={(id, text) => p.edit(p.active, id, text)}
        onDelete={(id) => p.remove(p.active, id)}
        onPin={(id) => p.pin(p.active, id)}
        onVote={(id, option) => p.vote(p.active, id, option)}
      />
      {settingsOpen && (
        <Settings
          me={p.me}
          blocked={p.blocked}
          privacy={p.privacy}
          initialSection={settingsSection}
          onPrivacy={p.updatePrivacy}
          onUnblock={doUnblock}
          appearance={appearance}
          prefs={prefs}
          onAppearance={setAppearance}
          onColor={p.updateColor}
          onStatus={p.updateStatus}
          onProfile={p.updateProfile}
          onChangePassword={p.changePassword}
          onLogout={logout}
          onPrefs={changePrefs}
          savedCount={saved.length}
          onClearDrafts={clearAllDrafts}
          onClearSaved={clearAllSaved}
          onReset={resetSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {friendsTab && (
        <Friends
          tab={friendsTab}
          users={p.users}
          friends={p.friends}
          incoming={p.incoming}
          outgoing={p.outgoing}
          onRequest={p.friendRequest}
          onAccept={p.friendAccept}
          onDecline={p.friendDecline}
          onCancel={p.friendCancel}
          onRemove={p.friendRemove}
          onProfile={(u) => setProfileUser(u)}
          onMessage={(u) => {
            setFriendsTab(null);
            select(dmId(p.me.id, u.id));
          }}
          onClose={() => setFriendsTab(null)}
        />
      )}
      {discoverOpen && (
        <Discover
          onBrowse={p.browseRooms}
          onJoin={p.joinRoom}
          onOpen={(id) => {
            setDiscoverOpen(false);
            select(id);
          }}
          onClose={() => setDiscoverOpen(false)}
        />
      )}
      {profileUser && (() => {
        const person = p.users.find((u) => u.id === profileUser.id) || profileUser;
        const relation = relationOf(person.id);
        const hasDm = !!p.messages[dmId(p.me.id, person.id)]?.length;
        return (
          <ProfileCard
            user={person}
            me={p.me}
            relation={relation}
            canMessage={(relation === 'friends' || hasDm) && !blockedIds.includes(person.id)}
            isBlocked={blockedIds.includes(person.id)}
            onBlock={doBlock}
            onUnblock={doUnblock}
            onClose={() => setProfileUser(null)}
            onMessage={(u) => {
              setProfileUser(null);
              select(dmId(p.me.id, u.id));
            }}
            onEdit={() => {
              setProfileUser(null);
              setSettingsSection('profile');
              setSettingsOpen(true);
            }}
            onAddFriend={(u) => p.friendRequest(u.name)}
            onAccept={(u) => p.friendAccept(u.id)}
            onDecline={(u) => p.friendDecline(u.id)}
            onCancel={(u) => p.friendCancel(u.id)}
            onRemove={(u) => p.friendRemove(u.id)}
          />
        );
      })()}
      <Toaster />
      <Confetti />
      {quickOpen && (
        <QuickSwitcher
          me={p.me}
          rooms={p.rooms}
          users={people}
          messages={shownMessages}
          onPick={select}
          onClose={() => setQuickOpen(false)}
        />
      )}
    </div>
  );
}
