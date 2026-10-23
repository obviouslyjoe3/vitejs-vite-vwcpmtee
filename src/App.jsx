import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParley, dmId } from './useParley.js';
import { loadPrefs, savePrefs, beep, showDesktop, askDesktopPermission } from './notify.js';
import Auth from './components/Auth.jsx';
import Sidebar from './components/Sidebar.jsx';
import Thread from './components/Thread.jsx';
import Settings from './components/Settings.jsx';
import QuickSwitcher from './components/QuickSwitcher.jsx';
import ProfileCard from './components/ProfileCard.jsx';
import Friends from './components/Friends.jsx';
import Discover from './components/Discover.jsx';
import Logo from './components/Logo.jsx';
import {
  loadAppearance, saveAppearance, applyAppearance,
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

  const onFriendRequest = useCallback((from) => {
    const { prefs: pf } = live.current;
    if (pf.sound) beep();
    if (pf.desktop && document.hidden) showDesktop(from.name, 'Sent you a friend request');
  }, []);

  const p = useParley({ onIncoming, onFriendRequest });
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
    setSaved(loadSaved(meId));
  }, [meId]);

  const toggleSaved = (msg) => {
    if (!meId) return;
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

  // People you can talk to: your friends, plus anyone you already have a DM with (read-only if no longer friends)
  const friendSet = useMemo(() => new Set(p.friends), [p.friends]);
  const people = useMemo(() => {
    if (!p.me) return [];
    const ids = new Set(p.friends);
    for (const key of Object.keys(p.messages)) {
      if (!key.startsWith('dm:')) continue;
      for (const id of key.slice(3).split('|')) if (id !== p.me.id) ids.add(id);
    }
    return p.users.filter((u) => ids.has(u.id));
  }, [p.me, p.friends, p.messages, p.users]);

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
      };
    }
    const room = p.rooms.find((r) => r.id === p.active);
    if (!room) return null;
    const n = room.count ?? room.members?.length ?? 0;
    const subtitle = room.private
      ? `Private group · ${n} ${n === 1 ? 'member' : 'members'}${room.topic ? ' · ' + room.topic : ''}`
      : `${n} ${n === 1 ? 'member' : 'members'}${room.topic ? ' · ' + room.topic : ''}`;
    return { id: room.id, kind: 'room', title: room.name, subtitle, topic: room.topic, room };
  }, [p.me, p.active, p.users, p.rooms, friendSet]);

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
    .filter((id) => id !== p.me.id)
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
        messages={p.messages}
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
        onOpenSettings={() => setSettingsOpen(true)}
        onQuick={() => setQuickOpen(true)}
        onMarkAllRead={p.markAllRead}
      />
      <Thread
        key={p.active || 'none'}
        conv={conv}
        me={p.me}
        users={p.users}
        friendUsers={friendUsers}
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
          onProfile={p.updateProfile}
          onChangePassword={p.changePassword}
          onLogout={logout}
          onPrefs={changePrefs}
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
            canMessage={relation === 'friends' || hasDm}
            onClose={() => setProfileUser(null)}
            onMessage={(u) => {
              setProfileUser(null);
              select(dmId(p.me.id, u.id));
            }}
            onEdit={() => {
              setProfileUser(null);
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
      {quickOpen && (
        <QuickSwitcher
          me={p.me}
          rooms={p.rooms}
          users={people}
          messages={p.messages}
          onPick={select}
          onClose={() => setQuickOpen(false)}
        />
      )}
    </div>
  );
}
