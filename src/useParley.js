import { useCallback, useEffect, useReducer, useRef } from 'react';
import { socket } from './socket.js';

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

const initial = {
  status: 'connecting', // connecting | connected | offline
  me: null,
  rooms: [],
  users: [],
  messages: {}, // conversationId -> message[]
  unread: {},
  typing: {}, // conversationId -> { userId: expiresAt }
  active: null,
  error: '',
};

function reducer(s, a) {
  switch (a.type) {
    case 'status':
      return { ...s, status: a.status };
    case 'error':
      return { ...s, error: a.error };
    case 'reset':
      return { ...initial, status: s.status };
    case 'init':
      return {
        ...s,
        me: a.me,
        rooms: a.rooms,
        users: a.users,
        messages: a.history,
        active: s.active ?? a.rooms[0]?.id ?? null,
        error: '',
      };
    case 'users':
      return { ...s, users: a.users };
    case 'roomNew':
      return s.rooms.some((r) => r.id === a.room.id) ? s : { ...s, rooms: [...s.rooms, a.room] };
    case 'active':
      return { ...s, active: a.id, unread: { ...s.unread, [a.id]: 0 } };
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
            m.cid === a.cid && m.pending ? { ...m, pending: false, failed: true } : m
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
            m.id === a.id ? { ...m, reactions: a.reactions } : m
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

export function useParley() {
  const [state, dispatch] = useReducer(reducer, initial);
  const sessionRef = useRef(readSession());

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
      dispatch({ type: 'init', me: res.user, rooms: res.rooms, users: res.users, history: res.history });
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
    socket.on('message:new', (msg) => dispatch({ type: 'msgNew', msg }));
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

  const send = useCallback(
    (room, text) => {
      const cid = uid();
      dispatch({
        type: 'pending',
        msg: { id: cid, cid, room, text, user: me, ts: Date.now(), reactions: {}, pending: true },
      });
      socket.emit('message:send', { room, text, cid }, (res) => {
        if (res?.error) dispatch({ type: 'failed', room, cid });
      });
    },
    [me]
  );

  const createRoom = useCallback(
    (name) =>
      new Promise((resolve) => {
        socket.emit('room:create', { name }, (res) => {
          if (res?.room) dispatch({ type: 'roomNew', room: res.room });
          if (res?.room) dispatch({ type: 'active', id: res.room.id });
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
      dispatch({ type: 'reset' });
      socket.disconnect();
      socket.connect();
    },
    setActive: (id) => dispatch({ type: 'active', id }),
    send,
    react: (room, messageId, emoji) => socket.emit('react', { room, messageId, emoji }),
    sendTyping: (room) => socket.emit('typing', { room }),
    createRoom,
  };
}
