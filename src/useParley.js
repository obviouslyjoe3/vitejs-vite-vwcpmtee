import { useCallback, useEffect, useReducer, useRef } from 'react';
import { socket } from './socket.js';
import { loadReadMap, saveReadMap } from './prefs.js';

const TOKEN_KEY = 'parley:token';
const TYPING_MS = 3000;

export const dmId = (a, b) => 'dm:' + [a, b].sort().join('|');

export function uid() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  );
}

// The sign-in token lives in localStorage so every tab (and a reload) stays signed in.
const readToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY) || null;
  } catch {
    return null;
  }
};
const writeToken = (value) => {
  try {
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
};

const ACTIVE_KEY = 'parley:active';
const readActive = () => {
  try {
    return sessionStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
};
const writeActive = (id) => {
  try {
    if (id) sessionStorage.setItem(ACTIVE_KEY, id);
    else sessionStorage.removeItem(ACTIVE_KEY);
  } catch {}
};

const initial = {
  status: 'connecting', // connecting | connected | offline
  me: null,
  rooms: [],
  users: [],
  friends: [], // user ids
  incoming: [], // ids of people who asked to be your friend
  outgoing: [], // ids of people you asked
  messages: {}, // conversationId -> message[]
  unread: {},
  lastRead: {}, // conversationId -> ts of newest message seen
  dividers: {}, // conversationId -> ts to draw the "New" divider after (or null)
  typing: {}, // conversationId -> { userId: expiresAt }
  active: null,
  error: '',
};

const newestTs = (list) => (list?.length ? Math.max(...list.map((m) => m.ts || 0)) : 0);
const countUnread = (list, since, meId) =>
  (list || []).filter((m) => m.ts > since && m.user.id !== meId && !m.deleted && !m.pending && !m.system).length;

function reducer(s, a) {
  switch (a.type) {
    case 'status':
      return { ...s, status: a.status };
    case 'error':
      return { ...s, error: a.error };
    case 'reset':
      return { ...initial, status: s.status, error: a.error || '' };
    case 'friends':
      return { ...s, friends: a.friends, incoming: a.incoming, outgoing: a.outgoing };
    case 'userUpdate': {
      const exists = s.users.some((u) => u.id === a.user.id);
      return {
        ...s,
        users: exists ? s.users.map((u) => (u.id === a.user.id ? a.user : u)) : [...s.users, a.user],
        me: s.me && s.me.id === a.user.id ? a.user : s.me,
      };
    }
    case 'history': {
      // messages of a room you just joined (or were added to): all of it counts as read
      const lastRead = { ...s.lastRead };
      for (const [conv, list] of Object.entries(a.history)) lastRead[conv] = newestTs(list);
      return { ...s, messages: { ...s.messages, ...a.history }, lastRead };
    }
    case 'init': {
      const back = a.preferred;
      const valid =
        back && (a.rooms.some((r) => r.id === back) || (back.startsWith('dm:') && back.includes(a.me.id)));
      const active = s.active ?? (valid ? back : null) ?? a.rooms[0]?.id ?? null;
      const lastRead = { ...a.readMap, ...s.lastRead };
      const unread = {};
      for (const [conv, list] of Object.entries(a.history)) {
        if (lastRead[conv] === undefined) lastRead[conv] = newestTs(list); // first visit: nothing is "new"
        unread[conv] = conv === active ? 0 : countUnread(list, lastRead[conv], a.me.id);
      }
      const dividers = { ...s.dividers };
      if (active && s.active === null) {
        const n = countUnread(a.history[active], lastRead[active], a.me.id);
        dividers[active] = n ? lastRead[active] : null;
      }
      if (active) lastRead[active] = newestTs(a.history[active]);
      return {
        ...s,
        me: a.me,
        rooms: a.rooms,
        users: a.users,
        friends: a.friends?.friends || [],
        incoming: a.friends?.incoming || [],
        outgoing: a.friends?.outgoing || [],
        messages: a.history,
        active,
        unread,
        lastRead,
        dividers,
        error: '',
      };
    }
    case 'roomUpdate':
      return { ...s, rooms: s.rooms.map((r) => (r.id === a.room.id ? a.room : r)) };
    case 'markAllRead': {
      const lastRead = { ...s.lastRead };
      for (const [conv, list] of Object.entries(s.messages)) lastRead[conv] = newestTs(list);
      return { ...s, lastRead, unread: {} };
    }
    case 'users':
      return {
        ...s,
        users: a.users,
        me: s.me ? a.users.find((u) => u.id === s.me.id) ?? s.me : s.me,
      };
    case 'roomRemove': {
      const rooms = s.rooms.filter((r) => r.id !== a.id);
      const { [a.id]: _m, ...messages } = s.messages;
      const { [a.id]: _u, ...unread } = s.unread;
      const active = s.active === a.id ? rooms[0]?.id ?? null : s.active;
      return { ...s, rooms, messages, unread, active };
    }
    case 'roomNew':
      return s.rooms.some((r) => r.id === a.room.id) ? s : { ...s, rooms: [...s.rooms, a.room] };
    case 'active': {
      const list = s.messages[a.id];
      const since = s.lastRead[a.id] ?? newestTs(list);
      const n = countUnread(list, since, s.me?.id);
      return {
        ...s,
        active: a.id,
        unread: { ...s.unread, [a.id]: 0 },
        dividers: { ...s.dividers, [a.id]: n ? since : null },
        lastRead: { ...s.lastRead, [a.id]: newestTs(list) },
      };
    }
    case 'pending':
      return {
        ...s,
        messages: { ...s.messages, [a.msg.room]: [...(s.messages[a.msg.room] || []), a.msg] },
      };
    case 'failed':
      return {
        ...s,
        messages: {
          ...s.messages,
          [a.room]: (s.messages[a.room] || []).map((m) =>
            m.cid === a.cid && m.pending ? { ...m, pending: false, failed: true, error: a.error } : m
          ),
        },
      };
    case 'msgNew': {
      const m = a.msg;
      const list = s.messages[m.room] || [];
      if (list.some((x) => x.id === m.id)) return s;
      const at = m.cid ? list.findIndex((x) => x.pending && x.cid === m.cid) : -1;
      const next = at >= 0 ? list.map((x, i) => (i === at ? m : x)) : [...list, m];
      const mine = m.user.id === s.me?.id;
      const unread =
        !mine && m.room !== s.active
          ? { ...s.unread, [m.room]: (s.unread[m.room] || 0) + 1 }
          : s.unread;
      const roomTyping = { ...(s.typing[m.room] || {}) };
      delete roomTyping[m.user.id];
      return {
        ...s,
        messages: { ...s.messages, [m.room]: next },
        lastRead: m.room === s.active || mine ? { ...s.lastRead, [m.room]: m.ts } : s.lastRead,
        unread,
        typing: { ...s.typing, [m.room]: roomTyping },
      };
    }
    case 'msgUpdate':
      return {
        ...s,
        messages: {
          ...s.messages,
          [a.room]: (s.messages[a.room] || []).map((m) =>
            m.id === a.id ? { ...m, ...a.patch } : m
          ),
        },
      };
    case 'typing':
      return {
        ...s,
        typing: {
          ...s.typing,
          [a.room]: { ...(s.typing[a.room] || {}), [a.userId]: Date.now() + TYPING_MS },
        },
      };
    case 'tick': {
      const now = Date.now();
      let changed = false;
      const typing = {};
      for (const [room, map] of Object.entries(s.typing)) {
        const kept = {};
        for (const [userId, until] of Object.entries(map)) {
          if (until > now) kept[userId] = until;
          else changed = true;
        }
        if (Object.keys(kept).length) typing[room] = kept;
      }
      return changed ? { ...s, typing } : s;
    }
    default:
      return s;
  }
}

const ask = (event, payload) =>
  new Promise((resolve) => socket.emit(event, payload, (res) => resolve(res || {})));

export function useParley({ onIncoming, onFriendRequest } = {}) {
  const [state, dispatch] = useReducer(reducer, initial);
  const tokenRef = useRef(readToken());
  const incomingRef = useRef(onIncoming);
  incomingRef.current = onIncoming;
  const friendRef = useRef(onFriendRequest);
  friendRef.current = onFriendRequest;

  // Everything the server sends when you sign in, register or resume
  const start = useCallback((res) => {
    if (res.token) {
      tokenRef.current = res.token;
      writeToken(res.token);
    }
    dispatch({
      type: 'init',
      me: res.user,
      rooms: res.rooms,
      users: res.users,
      history: res.history,
      friends: res.friends,
      readMap: loadReadMap(res.user.id),
      preferred: readActive(),
    });
  }, []);

  const signedOut = useCallback((error = '') => {
    tokenRef.current = null;
    writeToken(null);
    writeActive(null);
    dispatch({ type: 'reset', error });
  }, []);

  const resume = useCallback(() => {
    if (!tokenRef.current) return;
    socket.emit('auth:resume', { token: tokenRef.current }, (res) => {
      if (res?.error) {
        if (res.expired) return signedOut(res.error);
        // Not an expiry (a hiccup, or this tab is already signed in): keep the saved sign-in and try again.
        if (res.error !== 'Already signed in.') setTimeout(() => socket.connected && resume(), 1500);
        return;
      }
      start(res);
    });
  }, [start, signedOut]);

  useEffect(() => {
    const onConnect = () => {
      dispatch({ type: 'status', status: 'connected' });
      resume();
    };
    const onOffline = () => dispatch({ type: 'status', status: 'offline' });

    socket.on('connect', onConnect);
    socket.on('disconnect', onOffline);
    socket.on('connect_error', onOffline);
    socket.on('users', (users) => dispatch({ type: 'users', users }));
    socket.on('user:update', (user) => dispatch({ type: 'userUpdate', user }));
    socket.on('friends', (f) => dispatch({ type: 'friends', ...f }));
    socket.on('friend:incoming', (info) => friendRef.current?.(info));
    socket.on('history', (history) => dispatch({ type: 'history', history }));
    socket.on('room:new', (room) => dispatch({ type: 'roomNew', room }));
    socket.on('room:update', (room) => dispatch({ type: 'roomUpdate', room }));
    socket.on('room:remove', ({ id }) => dispatch({ type: 'roomRemove', id }));
    socket.on('message:new', (msg) => {
      incomingRef.current?.(msg);
      dispatch({ type: 'msgNew', msg });
    });
    socket.on('message:update', (u) => dispatch({ type: 'msgUpdate', ...u }));
    socket.on('typing', ({ room, user }) => dispatch({ type: 'typing', room, userId: user.id }));
    // the server ended this sign-in (logged out in another tab, or the password changed)
    socket.on('auth:ended', () => {
      signedOut('You were signed out.');
      socket.connect();
    });

    socket.connect();
    const tick = setInterval(() => dispatch({ type: 'tick' }), 1000);

    return () => {
      clearInterval(tick);
      socket.off();
      socket.disconnect();
    };
  }, [resume, signedOut]);

  const me = state.me;

  // remember which conversation you had open (so a reload puts you back there)
  useEffect(() => {
    if (state.me && state.active) writeActive(state.active);
  }, [state.me, state.active]);

  // remember what you have read, so unread counts survive a reload
  useEffect(() => {
    if (state.me) saveReadMap(state.me.id, state.lastRead);
  }, [state.me, state.lastRead]);

  const send = useCallback(
    (room, { text, image, replyTo, poll }) => {
      const cid = uid();
      const snapshot = replyTo
        ? {
            id: replyTo.id,
            name: replyTo.user.name,
            text: (replyTo.text || '').slice(0, 140),
            image: !!replyTo.image,
            deleted: !!replyTo.deleted,
          }
        : null;
      dispatch({
        type: 'pending',
        msg: {
          id: cid, cid, room, text, image: image || null, poll: poll ? { ...poll, options: poll.options.map((t, i) => ({ id: String(i), text: t, votes: [] })) } : null, replyTo: snapshot,
          user: me, ts: Date.now(), reactions: {}, edited: false, deleted: false, pending: true,
        },
      });
      socket.emit('message:send', { room, text, image, poll, cid, replyTo: replyTo?.id }, (res) => {
        if (res?.error) dispatch({ type: 'failed', room, cid, error: res.error });
      });
    },
    [me]
  );

  const createRoom = useCallback(async (opts) => {
    const res = await ask('room:create', typeof opts === 'string' ? { name: opts } : opts);
    if (res.room) {
      dispatch({ type: 'roomNew', room: res.room });
      dispatch({ type: 'active', id: res.room.id });
    }
    return res;
  }, []);

  const joinRoom = useCallback(async (id) => {
    const res = await ask('room:join', { id });
    if (res.room) {
      dispatch({ type: 'roomNew', room: res.room });
      dispatch({ type: 'roomUpdate', room: res.room });
    }
    return res;
  }, []);

  // Signing in, registering: resolve to { error } or {} (the 'init' dispatch does the rest)
  const authenticate = useCallback(
    async (event, payload) => {
      dispatch({ type: 'error', error: '' });
      const res = await ask(event, payload);
      if (res.error) return { error: res.error };
      start(res);
      return {};
    },
    [start]
  );

  return {
    ...state,
    restoring: !state.me && !!tokenRef.current, // a saved sign-in is being picked back up
    login: (username, password) => authenticate('auth:login', { username, password }),
    register: (username, password) => authenticate('auth:register', { username, password }),
    logout: async () => {
      await ask('auth:logout');
      signedOut();
      socket.disconnect();
      socket.connect();
    },
    changePassword: (current, next) => ask('auth:password', { current, next }),
    setActive: (id) => dispatch({ type: 'active', id }),
    send,
    edit: (room, id, text) => socket.emit('message:edit', { room, id, text }),
    remove: (room, id) => socket.emit('message:delete', { room, id }),
    react: (room, messageId, emoji) => socket.emit('react', { room, messageId, emoji }),
    sendTyping: (room) => socket.emit('typing', { room }),
    updateColor: (color) => socket.emit('profile:update', { color }),
    updateStatus: (status) => socket.emit('profile:update', { status }),
    pin: (room, id) => socket.emit('message:pin', { room, id }),
    vote: (room, id, option) => socket.emit('poll:vote', { room, id, option }),
    setTopic: (id, topic) => ask('room:topic', { id, topic }),
    updateProfile: (patch) => socket.emit('profile:update', patch),
    editRoom: (id, patch) => ask('room:edit', { id, ...patch }),
    deleteRoom: (id) => ask('room:delete', { id }),
    inviteToRoom: (id, ids) => ask('room:invite', { id, ids }),
    kickFromRoom: (id, userId) => ask('room:kick', { id, userId }),
    unbanFromRoom: (id, userId) => ask('room:unban', { id, userId }),
    leaveRoom: (id) => ask('room:leave', { id }),
    browseRooms: (q) => ask('rooms:browse', { q }),
    roomMembers: (id) => ask('room:members', { id }),
    joinRoom,
    friendRequest: (username) => ask('friend:request', { username }),
    friendAccept: (id) => ask('friend:accept', { id }),
    friendDecline: (id) => ask('friend:decline', { id }),
    friendCancel: (id) => ask('friend:cancel', { id }),
    friendRemove: (id) => ask('friend:remove', { id }),
    markAllRead: () => dispatch({ type: 'markAllRead' }),
    createRoom,
  };
}
