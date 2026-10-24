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
import MessageRequests from './components/MessageRequests.jsx';
import ForwardDialog from './components/ForwardDialog.jsx';
import ShortcutsDialog from './components/ShortcutsDialog.jsx';
import Logo from './components/Logo.jsx';
import { QUIET_ROOMS, MAX_REQUEST_MSGS } from './constants.js';
import Toaster from './components/Toaster.jsx';
import Confetti from './components/Confetti.jsx';
import { toast, confetti } from './toast.js';
import { loadReminders, saveReminders } from './reminders.js';
import { fmtStamp } from './format.js';
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
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [forwardMsg, setForwardMsg] = useState(null);
  const [keysOpen, setKeysOpen] = useState(false);
  const [draftIds, setDraftIds] = useState({}); // conversation id -> true while it holds an unsent draft
  const [access, setAccess] = useState({}); // other person's id -> how you may message them (from the server)
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
    if (live.current.requestRooms?.includes(msg.room)) return; // message requests have their own, quieter alert
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

  const onDmRequest = useCallback((from) => {
    const { prefs: pf } = live.current;
    toast(`${from.from.name} sent you a message request`);
    if (pf.reqAlerts === false || alertsSilenced(pf)) return;
    if (pf.sound) beep(pf.volume);
    if (pf.desktop && document.hidden) showDesktop(from.from.name, pf.preview ? from.text : 'Sent you a message request');
  }, []);
  const onDmAccepted = useCallback((info) => {
    toast(`${info.by.name} accepted your message request`, 'success');
  }, []);

  const p = useParley({ onIncoming, onFriendRequest, onDmRequest, onDmAccepted });
  const blockedIds = useMemo(() => p.blocked.map((b) => b.id), [p.blocked]);
  // message requests: threads from people who are not your friends yet
  const incomingThreads = useMemo(() => p.dms.filter((t) => t.incoming && t.state === 'pending'), [p.dms]);
  const requestRooms = useMemo(() => incomingThreads.map((t) => t.id), [incomingThreads]);
  const pendingOut = useMemo(() => p.dms.filter((t) => !t.incoming && t.state === 'pending').map((t) => t.id), [p.dms]);
  live.current = { ...live.current, me: p.me, active: p.active, prefs, muted: convPrefs.muted, blockedIds, requestRooms };

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

  // unread @mentions per conversation (the global room has no unread count, but a mention still shows)
  const mentionCounts = useMemo(() => {
    const out = {};
    if (!p.me) return out;
    const tag = '@' + p.me.name.toLowerCase();
    for (const [id, list] of Object.entries(p.messages)) {
      if (id === p.active) continue;
      if (!(p.unread[id] > 0) && !QUIET_ROOMS.includes(id)) continue;
      const since = p.lastRead[id] ?? 0;
      let n = 0;
      for (const m of list) {
        if (m.ts > since && m.user.id !== p.me.id && !m.deleted && !m.system && !blockedIds.includes(m.user.id) && m.text && m.text.toLowerCase().includes(tag)) n += 1;
      }
      if (n) out[id] = n;
    }
    return out;
  }, [p.messages, p.lastRead, p.unread, p.active, p.me, blockedIds]);

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
    setDraftIds(Object.fromEntries(Object.entries(drafts.current).filter(([, v]) => v).map(([k]) => [k, true])));
    setSaved(loadSaved(meId));
    setReminders(loadReminders(meId));
  }, [meId]);

  // Reminders: set from a message's ⋯ menu, fired here while Parley is open
  const [reminders, setReminders] = useState([]);
  const remindersRef = useRef(reminders);
  remindersRef.current = reminders;
  const remindMap = useMemo(() => Object.fromEntries(reminders.map((r) => [r.id, r.at])), [reminders]);
  const setReminder = (msg, at) => {
    if (!meId) return;
    setReminders((cur) => {
      const rest = cur.filter((r) => r.id !== msg.id);
      const next = at
        ? [...rest, { id: msg.id, room: msg.room, at, who: msg.user?.name || '', text: String(msg.text || (msg.image ? 'Photo' : msg.poll?.question || '')).slice(0, 80) }]
        : rest;
      saveReminders(meId, next);
      return next;
    });
    toast(at ? `Okay, I’ll remind you ${fmtStamp(at)}` : 'Reminder cancelled', 'success');
  };
  useEffect(() => {
    if (!meId) return;
    const check = () => {
      const now = Date.now();
      const due = remindersRef.current.filter((r) => r.at <= now);
      if (!due.length) return;
      const next = remindersRef.current.filter((r) => r.at > now);
      saveReminders(meId, next);
      setReminders(next);
      for (const r of due) {
        const body = `${r.who ? r.who + ': ' : ''}${r.text || 'a message'}`;
        toast(`Reminder · ${body}`);
        if (document.hidden) showDesktop('Parley reminder', body);
      }
    };
    const t = setInterval(check, 15000);
    check();
    return () => clearInterval(t);
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
    (a, [id, n]) => (convPrefs.muted.includes(id) || requestRooms.includes(id) ? a : a + n),
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

  // ? opens the shortcut list (unless you are typing somewhere)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      setKeysOpen((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Alt+Up / Alt+Down switch conversation; Esc closes an open side panel
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && panel && !settingsOpen && !quickOpen && !profileUser && !friendsTab && !discoverOpen && !requestsOpen && !forwardMsg && !keysOpen) {
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
    setDraftIds({});
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
      if (!key.startsWith('dm:') || requestRooms.includes(key)) continue; // requests wait in their own inbox
      for (const id of key.slice(3).split('|')) if (id !== p.me.id) ids.add(id);
    }
    return p.users.filter((u) => ids.has(u.id) && !blockedIds.includes(u.id));
  }, [p.me, p.friends, p.messages, p.users, blockedIds, requestRooms]);

  const requestList = useMemo(
    () =>
      incomingThreads
        .map((t) => {
          const user = p.users.find((u) => u.id === t.other);
          if (!user || blockedIds.includes(user.id)) return null;
          const messages = (p.messages[t.id] || []).filter((m) => m.user.id === user.id && !m.deleted && !m.system).slice(-3);
          return { id: t.id, user, thread: t, messages, last: messages[messages.length - 1] };
        })
        .filter(Boolean)
        .sort((a, b) => (b.last?.ts || 0) - (a.last?.ts || 0)),
    [incomingThreads, p.users, p.messages, blockedIds]
  );
  const outgoingList = useMemo(
    () =>
      p.dms
        .filter((t) => !t.incoming && t.state === 'pending')
        .map((t) => ({ id: t.id, left: t.left, user: p.users.find((u) => u.id === t.other) }))
        .filter((o) => o.user && !blockedIds.includes(o.user.id)),
    [p.dms, p.users, blockedIds]
  );

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

  // quick "pause alerts" from the sidebar moon button
  const setDnd = (until, label) => {
    changePrefs({ ...prefs, pauseUntil: until });
    toast(until ? `Alerts paused ${label.startsWith('tomorrow') ? 'until 9 am' : 'for ' + label}` : 'Alerts are back on', 'success');
  };

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

  const addFriend = async (u) => {
    const res = await p.friendRequest(u.name);
    toast(res?.error || (res.accepted ? `You and ${u.name} are now friends` : `Friend request sent to ${u.name}`), res?.error ? 'error' : 'success');
    return res;
  };
  const acceptRequest = async (otherId) => {
    const res = await p.acceptRequest(otherId);
    if (res?.error) toast(res.error, 'error');
    return res;
  };
  const declineRequest = async (otherId) => {
    const res = await p.declineRequest(otherId);
    toast(res?.error || 'Request deleted. They weren’t told.', res?.error ? 'error' : 'success');
    return res;
  };
  const forwardTo = (roomId, label) => {
    const m = forwardMsg;
    setForwardMsg(null);
    if (!m) return;
    p.send(roomId, { text: m.text || '', image: m.image || null, forward: m });
    toast(`Forwarded to ${roomId.startsWith('dm:') ? label : '#' + label}`, 'success');
  };

  const relationOf = (id) =>
    friendSet.has(id) ? 'friends' : p.incoming.includes(id) ? 'incoming' : p.outgoing.includes(id) ? 'outgoing' : 'none';
  const friendUsers = useMemo(() => p.users.filter((u) => friendSet.has(u.id)), [p.users, friendSet]);

  const activeOther = p.me && p.active?.startsWith('dm:') ? p.active.slice(3).split('|').find((x) => x !== p.me.id) : null;
  const activeThread = p.dms.find((t) => t.id === p.active) || null;

  // When there is no thread yet, ask the server how you may message this person (friends-only, request, ...)
  const needsAccess = !!activeOther && !friendSet.has(activeOther) && !activeThread;
  useEffect(() => {
    if (!needsAccess) return undefined;
    let live = true;
    p.profileInfo(activeOther).then((res) => {
      if (live && res.dm) setAccess((a) => ({ ...a, [activeOther]: res.dm }));
    });
    return () => {
      live = false;
    };
  }, [needsAccess, activeOther]);

  const conv = useMemo(() => {
    if (!p.me || !p.active) return null;
    if (p.active.startsWith('dm:')) {
      const otherId = p.active.slice(3).split('|').find((x) => x !== p.me.id);
      const user = p.users.find((u) => u.id === otherId);
      if (!user) return null;
      const isBlocked = blockedIds.includes(user.id);
      const asked = access[user.id];
      let dmMode = 'open';
      let left = MAX_REQUEST_MSGS;
      let reasonText = '';
      if (isBlocked) dmMode = 'blocked';
      else if (friendSet.has(user.id) || activeThread?.state === 'accepted') dmMode = 'open';
      else if (activeThread?.incoming) dmMode = 'incoming';
      else if (activeThread) {
        left = activeThread.left;
        dmMode = left > 0 ? 'request-sent' : 'waiting';
      } else if (asked?.mode === 'open') dmMode = 'open';
      else if (asked?.mode === 'waiting') dmMode = 'waiting';
      else if (asked?.mode === 'no') {
        dmMode = 'closed';
        reasonText =
          asked.reason === 'friends'
            ? `${user.name} only takes messages from friends.`
            : asked.reason === 'shared'
            ? `${user.name} only takes messages from friends and people they share a group with.`
            : '';
      } else dmMode = 'request-new';
      return {
        id: p.active,
        kind: 'dm',
        title: user.name,
        subtitle:
          dmMode === 'incoming'
            ? 'Message request'
            : dmMode === 'request-sent' || dmMode === 'waiting'
            ? 'Message request sent'
            : user.online
            ? 'Online now'
            : user.lastSeen
            ? `Last seen ${ago(user.lastSeen)}`
            : 'Offline',
        user,
        dmMode,
        left,
        reasonText,
        canFriend: relationOf(user.id) === 'none',
        blocked: isBlocked,
      };
    }
    const room = p.rooms.find((r) => r.id === p.active);
    if (!room) return null;
    const n = room.count ?? room.members?.length ?? 0;
    const subtitle = room.private
      ? `Private group · ${n} ${n === 1 ? 'member' : 'members'}${room.topic ? ' · ' + room.topic : ''}`
      : `${n} ${n === 1 ? 'member' : 'members'}${room.topic ? ' · ' + room.topic : ''}`;
    return { id: room.id, kind: 'room', title: room.name, subtitle, topic: room.topic, room };
  }, [p.me, p.active, p.users, p.rooms, friendSet, blockedIds, activeThread, access, p.friends, p.incoming, p.outgoing]);

  // Tell the other person you have read a direct message (they see "Seen", if both of you allow it)
  const readsOn = conv?.kind === 'dm' && conv.dmMode === 'open';
  const newestFromThem = readsOn
    ? Math.max(0, ...(p.messages[p.active] || []).filter((m) => m.user.id !== p.me.id).map((m) => m.ts || 0))
    : 0;
  useEffect(() => {
    if (!readsOn) return undefined;
    const send = () => {
      if (document.hasFocus() && !document.hidden) p.sendRead(p.active);
    };
    const t = setTimeout(send, 450);
    window.addEventListener('focus', send);
    document.addEventListener('visibilitychange', send);
    return () => {
      clearTimeout(t);
      window.removeEventListener('focus', send);
      document.removeEventListener('visibilitychange', send);
    };
  }, [readsOn, p.active, newestFromThem]);

  // people a message can be forwarded to (rooms are listed separately)
  const forwardPeople = useMemo(() => {
    if (!p.me) return [];
    const accepted = new Set(p.dms.filter((t) => t.state === 'accepted').map((t) => t.other));
    return p.users
      .filter((u) => u.id !== p.me.id && !blockedIds.includes(u.id) && (friendSet.has(u.id) || accepted.has(u.id)))
      .map((u) => ({ user: u, dmId: dmId(p.me.id, u.id) }));
  }, [p.me, p.users, p.dms, friendSet, blockedIds]);

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
    setRequestsOpen(false);
    setForwardMsg(null);
    setAccess({});
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
        favoriteIds={p.favorites}
        requestCount={p.incoming.length}
        msgRequestCount={requestList.length}
        pendingOut={pendingOut}
        onOpenRequests={() => setRequestsOpen(true)}
        drafts={draftIds}
        mentions={mentionCounts}
        dnd={{ until: prefs.pauseUntil || 0, paused: !!prefs.pause }}
        onDnd={setDnd}
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
          const id = p.active;
          setDraftIds((cur) => (!!cur[id] === !!text ? cur : { ...cur, [id]: !!text }));
        }}
        panel={panel}
        onPanel={setPanel}
        starred={starred}
        muted={muted}
        saved={saved}
        onSave={toggleSaved}
        reminders={remindMap}
        onRemind={setReminder}
        onProfile={setProfileUser}
        onAddFriend={addFriend}
        seenAt={p.reads[p.active] || 0}
        onForward={setForwardMsg}
        onAcceptRequest={(u) => acceptRequest(u.id)}
        onDeclineRequest={(u) => declineRequest(u.id)}
        onBlockUser={(u) => {
          if (window.confirm(`Block ${u.name}? They won’t be able to message you again, and this request goes away.`)) doBlock(u);
        }}
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
          favorites={p.favorites}
          since={p.since}
          reqTs={p.reqTs}
          onFavorite={p.friendFavorite}
          onSuggestions={p.friendSuggestions}
          onRequestById={p.friendRequestById}
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
        const pendingIn = incomingThreads.some((t) => t.other === person.id);
        return (
          <ProfileCard
            user={person}
            me={p.me}
            relation={relation}
            hasDm={hasDm}
            pendingIn={pendingIn}
            isBlocked={blockedIds.includes(person.id)}
            onLoadInfo={p.profileInfo}
            onSaveNote={p.saveNote}
            onOpenPerson={(f) => setProfileUser(p.users.find((u) => u.id === f.id) || f)}
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
            onAddFriend={addFriend}
            onAccept={(u) => p.friendAccept(u.id)}
            onDecline={(u) => p.friendDecline(u.id)}
            onCancel={(u) => p.friendCancel(u.id)}
            onRemove={(u) => p.friendRemove(u.id)}
            isFavorite={p.favorites.includes(person.id)}
            friendsSince={p.since[person.id] || 0}
            onFavorite={(u) => p.friendFavorite(u.id)}
          />
        );
      })()}
      {requestsOpen && (
        <MessageRequests
          requests={requestList}
          outgoing={outgoingList}
          onAccept={acceptRequest}
          onDecline={declineRequest}
          onBlock={doBlock}
          onProfile={(u) => setProfileUser(u)}
          onOpen={(id) => {
            setRequestsOpen(false);
            select(id);
          }}
          onClose={() => setRequestsOpen(false)}
        />
      )}
      {forwardMsg && (
        <ForwardDialog msg={forwardMsg} rooms={p.rooms} people={forwardPeople} onPick={forwardTo} onClose={() => setForwardMsg(null)} />
      )}
      {keysOpen && <ShortcutsDialog onClose={() => setKeysOpen(false)} />}
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
