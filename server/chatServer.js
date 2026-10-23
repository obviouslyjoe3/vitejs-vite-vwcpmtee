// Parley chat server. Attach it to any Node http.Server with attachChat(httpServer).
import { Server } from 'socket.io';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'parley.json');
const MAX_HISTORY = 300;
const REACTIONS = ['👍', '❤️', '😂', '🎉', '👀'];
const COLORS = ['#5B3FD9', '#0F8F73', '#C2347A', '#B8620F', '#2A6FBF', '#7A8A12', '#A33BC4'];

const DEFAULT_ROOMS = [
  { id: 'lobby', name: 'lobby', topic: 'Say hi to everyone' },
  { id: 'ideas', name: 'ideas', topic: 'Half-baked thoughts welcome' },
  { id: 'off-hours', name: 'off-hours', topic: 'Anything but work' },
];

const colorFor = (id) => {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
};

const loadSaved = () => {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return {};
  }
};

export function attachChat(httpServer) {
  const saved = loadSaved();
  const users = new Map(Object.entries(saved.users || {})); // id -> { id, name, color }
  const rooms = saved.rooms?.length ? saved.rooms : DEFAULT_ROOMS.map((r) => ({ ...r }));
  const history = saved.history || {}; // roomId -> messages[]
  const connections = new Map(); // userId -> open socket count

  let saveTimer = null;
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(
          DATA_FILE,
          JSON.stringify({ users: Object.fromEntries(users), rooms, history })
        );
      } catch {
        /* read-only file systems just skip persistence */
      }
    }, 400);
  };

  const io = new Server(httpServer, {
    serveClient: false,
    cors: { origin: true },
    destroyUpgrade: false, // lets Vite's own HMR websocket coexist
  });

  // ---- helpers ----
  const isDm = (id) => id.startsWith('dm:');
  const dmMembers = (id) => id.slice(3).split('|');
  const audience = (roomId) =>
    isDm(roomId) ? dmMembers(roomId).map((u) => `user:${u}`) : [`room:${roomId}`];

  const canAccess = (user, roomId) => {
    if (typeof roomId !== 'string') return false;
    if (isDm(roomId)) {
      const m = dmMembers(roomId);
      return m.length === 2 && m[0] !== m[1] && m.includes(user.id) && m.every((id) => users.has(id));
    }
    return rooms.some((r) => r.id === roomId);
  };

  const publicUsers = () =>
    [...users.values()].map((u) => ({ ...u, online: (connections.get(u.id) || 0) > 0 }));

  const historyFor = (userId) => {
    const out = {};
    for (const r of rooms) out[r.id] = history[r.id] || [];
    for (const key of Object.keys(history)) {
      if (isDm(key) && dmMembers(key).includes(userId)) out[key] = history[key];
    }
    return out;
  };

  const slug = (s) =>
    String(s || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24);

  // ---- connections ----
  io.on('connection', (socket) => {
    socket.on('hello', (payload, ack) => {
      if (socket.data.user) return ack?.({ error: 'Already joined.' });
      const name = String(payload?.name || '').trim().slice(0, 24);
      if (!name) return ack?.({ error: 'Enter a name to join.' });

      const wanted = payload?.id;
      const id = typeof wanted === 'string' && /^[\w-]{6,64}$/.test(wanted) ? wanted : randomUUID();
      const user = { id, name, color: users.get(id)?.color || colorFor(id) };
      users.set(id, user);

      socket.data.user = user;
      socket.join(`user:${id}`);
      rooms.forEach((r) => socket.join(`room:${r.id}`));
      connections.set(id, (connections.get(id) || 0) + 1);
      save();

      ack?.({ user, rooms, users: publicUsers(), history: historyFor(id) });
      io.emit('users', publicUsers());
    });

    socket.on('message:send', (p, ack) => {
      const user = socket.data.user;
      if (!user) return ack?.({ error: 'Join first.' });
      const text = String(p?.text || '').trim().slice(0, 2000);
      if (!text) return ack?.({ error: 'Message is empty.' });
      const room = String(p?.room || '');
      if (!canAccess(user, room)) return ack?.({ error: 'That conversation does not exist.' });

      const msg = {
        id: randomUUID(),
        cid: String(p?.cid || '').slice(0, 64),
        room,
        text,
        user: { id: user.id, name: user.name, color: user.color },
        ts: Date.now(),
        reactions: {},
      };
      const list = (history[room] ||= []);
      list.push(msg);
      if (list.length > MAX_HISTORY) list.splice(0, list.length - MAX_HISTORY);
      save();

      io.to(audience(room)).emit('message:new', msg);
      ack?.({ ok: true });
    });

    socket.on('typing', (p) => {
      const user = socket.data.user;
      const room = String(p?.room || '');
      if (!user || !canAccess(user, room)) return;
      socket.to(audience(room)).emit('typing', { room, user: { id: user.id, name: user.name } });
    });

    socket.on('react', (p) => {
      const user = socket.data.user;
      const room = String(p?.room || '');
      if (!user || !canAccess(user, room) || !REACTIONS.includes(p?.emoji)) return;
      const msg = history[room]?.find((m) => m.id === p.messageId);
      if (!msg) return;
      const list = (msg.reactions[p.emoji] ||= []);
      const at = list.indexOf(user.id);
      if (at >= 0) list.splice(at, 1);
      else list.push(user.id);
      if (!list.length) delete msg.reactions[p.emoji];
      save();
      io.to(audience(room)).emit('message:update', { room, id: msg.id, reactions: msg.reactions });
    });

    socket.on('room:create', (p, ack) => {
      const user = socket.data.user;
      if (!user) return ack?.({ error: 'Join first.' });
      const id = slug(p?.name);
      if (!id) return ack?.({ error: 'Use letters or numbers in the room name.' });
      if (rooms.some((r) => r.id === id)) return ack?.({ error: 'That room already exists.' });

      const room = { id, name: id, topic: `Started by ${user.name}` };
      rooms.push(room);
      for (const [, s] of io.sockets.sockets) if (s.data.user) s.join(`room:${id}`);
      save();
      io.emit('room:new', room);
      ack?.({ room });
    });

    socket.on('disconnect', () => {
      const user = socket.data.user;
      if (!user) return;
      const left = (connections.get(user.id) || 1) - 1;
      if (left <= 0) connections.delete(user.id);
      else connections.set(user.id, left);
      io.emit('users', publicUsers());
    });
  });

  return io;
}
