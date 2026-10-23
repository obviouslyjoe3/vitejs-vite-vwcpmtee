import { useCallback, useEffect, useReducer, useRef } from 'react';
import { socket } from './socket.js';
import { loadReadMap, saveReadMap } from './prefs.js';

const SESSION_KEY = 'parley:session';
const TYPING_MS = 3000;

export const dmId = (a, b) => 'dm:' + [a, b].sort().join('|');

export function uid() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  );
}

const readSession = () => {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
};
const writeSession = (value) => {
  try {
    if (value) sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(SESSION_KEY);
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
  (list || []).filter((m) => m.ts > since && m.user.id !== meId && !m.deleted && !m.pending).length;

function reducer(s, a) {
  switch (a.type) {
    case 'status':
      return { ...s, status: a.status };
    case 'error':
      return { ...s, error: a.error };
    case 'reset':
      return { ...initial, status: s.status };
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

export function useParley({ onIncoming } = {}) {
  const [state, dispatch] = useReducer(reducer, initial);
  const sessionRef = useRef(readSession());
  const incomingRef = useRef(onIncoming);
  incomingRef.current = onIncoming;

  const hello = useCallback((name) => {
    socket.emit('hello', { id: sessionRef.current?.id, name }, (res) => {
      if (res?.error) {
        sessionRef.current = null;
        writeSession(null);
        dispatch({ type: 'error', error: res.error });
        return;
      }
      sessionRef.current = { id: res.user.id, name: res.user.name };
      writeSession(sessionRef.current);
      dispatch({
        type: 'init',
        me: res.user,
        rooms: res.rooms,
        users: res.users,
        history: res.history,
        readMap: loadReadMap(res.user.id),
        preferred: readActive(),
      });
    });
  }, []);

  useEffect(() => {
    const onConnect = () => {
      dispatch({ type: 'status', status: 'connected' });
      if (sessionRef.current?.name) hello(sessionRef.current.name);
    };
    const onOffline = () => dispatch({ type: 'status', status: 'offline' });

    socket.on('connect', onConnect);
    socket.on('disconnect', onOffline);
    socket.on('connect_error', onOffline);
    socket.on('users', (users) => dispatch({ type: 'users', users }));
    socket.on('room:new', (room) => dispatch({ type: 'roomNew', room }));
    socket.on('room:update', (room) => dispatch({ type: 'roomUpdate', room }));
    socket.on('message:new', (msg) => {
      incomingRef.current?.(msg);
      dispatch({ type: 'msgNew', msg });
    });
    socket.on('message:update', (u) => dispatch({ type: 'msgUpdate', ...u }));
    socket.on('typing', ({ room, user }) => dispatch({ type: 'typing', room, userId: user.id }));

    socket.connect();
    const tick = setInterval(() => dispatch({ type: 'tick' }), 1000);

    return () => {
      clearInterval(tick);
      socket.off();
      socket.disconnect();
    };
  }, [hello]);

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

  const createRoom = useCallback(
    (name) =>
      new Promise((resolve) => {
        socket.emit('room:create', { name }, (res) => {
          if (res?.room) {
            dispatch({ type: 'roomNew', room: res.room });
            dispatch({ type: 'active', id: res.room.id });
          }
          resolve(res || {});
        });
      }),
    []
  );

  return {
    ...state,
    restoring: !state.me && !!sessionRef.current,
    join: (name) => {
      dispatch({ type: 'error', error: '' });
      hello(name);
    },
    leave: () => {
      sessionRef.current = null;
      writeSession(null);
      writeActive(null);
      dispatch({ type: 'reset' });
      socket.disconnect();
      socket.connect();
    },
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
    setTopic: (id, topic) =>
      new Promise((resolve) => socket.emit('room:topic', { id, topic }, (res) => resolve(res || {}))),
    markAllRead: () => dispatch({ type: 'markAllRead' }),
    createRoom,
  };
}
