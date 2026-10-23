// Parley chat server. Attach it to any Node http.Server with attachChat(httpServer).
import { Server } from 'socket.io';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'parley.json');
const MAX_HISTORY = 300;
const MAX_IMAGES_KEPT = 30; // per conversation; older images are dropped to keep storage small
const MAX_IMAGE_CHARS = 3_000_000;
// Keep in sync with REACTIONS in src/constants.js
const REACTIONS = [
  '👍', '❤️', '😂', '🎉', '👀', '🙏', '🔥', '😮', '😢', '🤔',
  '💯', '✅', '👏', '🚀', '💜', '😍', '🥳', '😅', '👎', '🙌',
];
const MAX_POLL_OPTIONS = 6;
// Keep in sync with COLORS in src/constants.js
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

const validImage = (v) =>
  typeof v === 'string' &&
  v.length <= MAX_IMAGE_CHARS &&
  /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(v)
    ? v
    : null;

const cleanStatus = (st) => {
  if (!st || typeof st !== 'object') return null;
  const text = String(st.text || '').trim().slice(0, 60);
  const emoji = String(st.emoji || '').trim().slice(0, 8);
  return text || emoji ? { emoji, text } : null;
};

const cleanBio = (v) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, 160);
const cleanPronouns = (v) => String(v || '').trim().slice(0, 20);
const cleanTz = (v) => {
  if (typeof v !== 'string' || !v) return '';
  try {
    new Intl.DateTimeFormat('en', { timeZone: v });
    return v;
  } catch {
    return '';
  }
};
const GROUP_ICONS = ['', '💬', '💡', '🎮', '🎵', '📚', '🍕', '🌱', '🚀', '🎨', '⚽', '✈️', '🐶', '☕'];
const MAX_MEMBERS = 50;

const cleanPoll = (p) => {
  if (!p || typeof p !== 'object') return null;
  const question = String(p.question || '').trim().slice(0, 140);
  const raw = Array.isArray(p.options) ? p.options : [];
  const options = raw
    .map((o) => String(o || '').trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, MAX_POLL_OPTIONS)
    .map((text, i) => ({ id: String(i), text, votes: [] }));
  if (!question || options.length < 2) return null;
  return { question, options, multi: !!p.multi };
};

// /roll [NdM] and /flip are resolved on the server so nobody can fake a result.
const runDice = (text) => {
  const roll = /^\/roll(?:\s+(\d{1,2})d(\d{1,3}))?\s*$/i.exec(text);
  if (roll) {
    const n = Math.max(1, Math.min(20, Number(roll[1] || 1)));
    const sides = Math.max(2, Math.min(100, Number(roll[2] || 6)));
    const dice = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * sides));
    const total = dice.reduce((a, b) => a + b, 0);
    return n === 1
      ? `rolled a d${sides}: ${total}`
      : `rolled ${n}d${sides}: ${dice.join(' + ')} = ${total}`;
  }
  if (/^\/flip\s*$/i.test(text)) return `flipped a coin: ${Math.random() < 0.5 ? 'heads' : 'tails'}`;
  return null;
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
  const users = new Map(Object.entries(saved.users || {})); // id -> { id, name, color, lastSeen? }
  const rooms = (saved.rooms?.length ? saved.rooms : DEFAULT_ROOMS.map((r) => ({ ...r }))).map((r) => ({
    icon: '', owner: null, private: false, members: [], createdAt: 0, ...r,
  }));
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
    maxHttpBufferSize: 4e6, // room for resized images
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
    const room = rooms.find((r) => r.id === roomId);
    return !!room && (!room.private || room.members.includes(user.id));
  };

  const visibleRooms = (userId) => rooms.filter((r) => !r.private || r.members.includes(userId));
  const roomTarget = (room) => (room.private ? io.to(`room:${room.id}`) : io);
  const joinMembers = (room) => {
    for (const [, s] of io.sockets.sockets) {
      if (s.data.user && room.members.includes(s.data.user.id)) s.join(`room:${room.id}`);
    }
  };

  // Small centered notices in a room ("Sam added Alex"), stored like messages.
  const addSystem = (room, text) => {
    const msg = {
      id: randomUUID(), cid: '', room: room.id, text, image: null, poll: null, action: false,
      pinned: false, replyTo: null, system: true,
      user: { id: 'system', name: 'Parley', color: '#888888' },
      ts: Date.now(), reactions: {}, edited: false, deleted: false,
    };
    (history[room.id] ||= []).push(msg);
    save();
    roomTarget(room).emit('message:new', msg);
  };

  const publicUsers = () =>
    [...users.values()].map((u) => ({ ...u, online: (connections.get(u.id) || 0) > 0 }));

  const historyFor = (userId) => {
    const out = {};
    for (const r of visibleRooms(userId)) out[r.id] = history[r.id] || [];
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

  const findMessage = (room, id) => {
    const m = history[room]?.find((m) => m.id === id);
    return m && !m.system ? m : undefined; // notices cannot be edited, pinned or reacted to
  };
  const patchMessage = (room, msg, patch) => {
    Object.assign(msg, patch);
    save();
    io.to(audience(room)).emit('message:update', { room, id: msg.id, patch });
  };

  // ---- connections ----
  io.on('connection', (socket) => {
    socket.on('hello', (payload, ack) => {
      if (socket.data.user) return ack?.({ error: 'Already joined.' });
      const name = String(payload?.name || '').trim().slice(0, 24);
      if (!name) return ack?.({ error: 'Enter a name to join.' });

      const wanted = payload?.id;
      const id = typeof wanted === 'string' && /^[\w-]{6,64}$/.test(wanted) ? wanted : randomUUID();
      const prev = users.get(id);
      const user = {
        ...prev,
        id,
        name,
        color: prev?.color || colorFor(id),
        status: prev?.status || null,
        bio: prev?.bio || '',
        pronouns: prev?.pronouns || '',
        tz: prev?.tz || '',
        joinedAt: prev?.joinedAt || Date.now(),
      };
      users.set(id, user);

      socket.data.user = user;
      socket.join(`user:${id}`);
      visibleRooms(id).forEach((r) => socket.join(`room:${r.id}`));
      connections.set(id, (connections.get(id) || 0) + 1);
      save();

      ack?.({ user, rooms: visibleRooms(id), users: publicUsers(), history: historyFor(id) });
      io.emit('users', publicUsers());
    });

    socket.on('message:send', (p, ack) => {
      const user = socket.data.user;
      if (!user) return ack?.({ error: 'Join first.' });

      // simple rate limit: 10 messages per 5 seconds
      const now = Date.now();
      const recent = (socket.data.recent || []).filter((t) => now - t < 5000);
      if (recent.length >= 10) return ack?.({ error: 'You are sending messages too fast.' });
      recent.push(now);
      socket.data.recent = recent;

      let text = String(p?.text || '').trim().slice(0, 2000);
      const image = validImage(p?.image);
      if (p?.image && !image) return ack?.({ error: 'That image could not be sent.' });
      const poll = p?.poll ? cleanPoll(p.poll) : null;
      if (p?.poll && !poll) return ack?.({ error: 'A poll needs a question and at least two options.' });
      let action = false;
      if (/^\/me\s+\S/i.test(text)) {
        action = true;
        text = text.replace(/^\/me\s+/i, '');
      } else {
        const rolled = runDice(text);
        if (rolled) {
          action = true;
          text = rolled;
        }
      }
      if (!text && !image && !poll) return ack?.({ error: 'Message is empty.' });

      const room = String(p?.room || '');
      if (!canAccess(user, room)) return ack?.({ error: 'That conversation does not exist.' });

      let replyTo = null;
      if (typeof p?.replyTo === 'string') {
        const orig = findMessage(room, p.replyTo);
        if (orig) {
          replyTo = {
            id: orig.id,
            name: orig.user.name,
            text: orig.deleted ? '' : String(orig.text || '').slice(0, 140),
            image: !!orig.image,
            deleted: !!orig.deleted,
          };
        }
      }

      const msg = {
        id: randomUUID(),
        cid: String(p?.cid || '').slice(0, 64),
        room,
        text,
        image,
        poll,
        action,
        pinned: false,
        replyTo,
        user: { id: user.id, name: user.name, color: user.color },
        ts: Date.now(),
        reactions: {},
        edited: false,
        deleted: false,
      };
      const list = (history[room] ||= []);
      list.push(msg);
      if (list.length > MAX_HISTORY) list.splice(0, list.length - MAX_HISTORY);

      const withImages = list.filter((m) => m.image);
      for (const old of withImages.slice(0, Math.max(0, withImages.length - MAX_IMAGES_KEPT))) {
        old.image = null;
        old.imageExpired = true;
      }
      save();

      io.to(audience(room)).emit('message:new', msg);
      ack?.({ ok: true });
    });

    socket.on('message:edit', (p) => {
      const user = socket.data.user;
      const room = String(p?.room || '');
      if (!user || !canAccess(user, room)) return;
      const msg = findMessage(room, p?.id);
      if (!msg || msg.user.id !== user.id || msg.deleted) return;
      const text = String(p?.text || '').trim().slice(0, 2000);
      if (!text && !msg.image) return;
      patchMessage(room, msg, { text, edited: true });
    });

    socket.on('message:delete', (p) => {
      const user = socket.data.user;
      const room = String(p?.room || '');
      if (!user || !canAccess(user, room)) return;
      const msg = findMessage(room, p?.id);
      if (!msg || msg.user.id !== user.id || msg.deleted) return;
      patchMessage(room, msg, { deleted: true, text: '', image: null, reactions: {} });
    });

    socket.on('message:pin', (p) => {
      const user = socket.data.user;
      const room = String(p?.room || '');
      if (!user || !canAccess(user, room)) return;
      const msg = findMessage(room, p?.id);
      if (!msg || msg.deleted) return;
      const pinned = !msg.pinned;
      patchMessage(room, msg, { pinned, pinnedBy: pinned ? user.name : null });
    });

    socket.on('poll:vote', (p) => {
      const user = socket.data.user;
      const room = String(p?.room || '');
      if (!user || !canAccess(user, room)) return;
      const msg = findMessage(room, p?.id);
      if (!msg?.poll || msg.deleted) return;
      const opt = msg.poll.options.find((o) => o.id === String(p?.option));
      if (!opt) return;
      const had = opt.votes.includes(user.id);
      if (!msg.poll.multi) for (const o of msg.poll.options) o.votes = o.votes.filter((v) => v !== user.id);
      if (!had) opt.votes.push(user.id);
      else if (msg.poll.multi) opt.votes = opt.votes.filter((v) => v !== user.id);
      patchMessage(room, msg, { poll: msg.poll });
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
      const msg = findMessage(room, p.messageId);
      if (!msg || msg.deleted) return;
      const list = (msg.reactions[p.emoji] ||= []);
      const at = list.indexOf(user.id);
      if (at >= 0) list.splice(at, 1);
      else list.push(user.id);
      if (!list.length) delete msg.reactions[p.emoji];
      patchMessage(room, msg, { reactions: msg.reactions });
    });

    socket.on('profile:update', (p) => {
      const user = socket.data.user;
      if (!user) return;
      const patch = {};
      if (p?.color !== undefined) {
        if (!COLORS.includes(p.color)) return;
        patch.color = p.color;
      }
      if (p?.status !== undefined) patch.status = cleanStatus(p.status);
      if (p?.bio !== undefined) patch.bio = cleanBio(p.bio);
      if (p?.pronouns !== undefined) patch.pronouns = cleanPronouns(p.pronouns);
      if (p?.tz !== undefined) patch.tz = cleanTz(p.tz);
      if (!Object.keys(patch).length) return;
      users.set(user.id, { ...users.get(user.id), ...patch });
      for (const [, s] of io.sockets.sockets) {
        if (s.data.user?.id === user.id) s.data.user = { ...s.data.user, ...patch };
      }
      save();
      io.emit('users', publicUsers());
    });

    socket.on('room:topic', (p, ack) => {
      const user = socket.data.user;
      if (!user) return ack?.({ error: 'Join first.' });
      const room = rooms.find((r) => r.id === p?.id);
      if (!room || !canAccess(user, room.id)) return ack?.({ error: 'That room does not exist.' });
      room.topic = String(p?.topic || '').trim().slice(0, 120);
      save();
      roomTarget(room).emit('room:update', room);
      ack?.({ room });
    });

    socket.on('room:create', (p, ack) => {
      const user = socket.data.user;
      if (!user) return ack?.({ error: 'Join first.' });
      const name = slug(p?.name);
      if (!name) return ack?.({ error: 'Use letters or numbers in the room name.' });
      if (rooms.some((r) => r.id === name || r.name === name)) return ack?.({ error: 'That room already exists.' });

      const isPrivate = !!p?.private;
      const invited = Array.isArray(p?.members) ? p.members : [];
      const members = isPrivate
        ? [...new Set([user.id, ...invited.filter((id) => typeof id === 'string' && users.has(id))])].slice(0, MAX_MEMBERS)
        : [];
      const icon = GROUP_ICONS.includes(p?.icon) ? p.icon : '';
      const room = {
        id: name,
        name,
        topic: String(p?.topic || '').trim().slice(0, 120) || `Started by ${user.name}`,
        icon,
        owner: user.id,
        private: isPrivate,
        members,
        createdAt: Date.now(),
      };
      rooms.push(room);
      if (isPrivate) {
        joinMembers(room);
        for (const m of members) io.to(`user:${m}`).emit('room:new', room);
      } else {
        for (const [, s] of io.sockets.sockets) if (s.data.user) s.join(`room:${name}`);
        io.emit('room:new', room);
      }
      addSystem(room, `${user.name} created ${isPrivate ? 'this private group' : 'this room'}`);
      save();
      ack?.({ room });
    });

    // owner: rename and change the icon
    socket.on('room:edit', (p, ack) => {
      const user = socket.data.user;
      if (!user) return ack?.({ error: 'Join first.' });
      const room = rooms.find((r) => r.id === p?.id);
      if (!room || !canAccess(user, room.id)) return ack?.({ error: 'That room does not exist.' });
      if (room.owner !== user.id) return ack?.({ error: 'Only the owner can change this.' });
      const before = room.name;
      if (p?.name !== undefined) {
        const name = slug(p.name);
        if (!name) return ack?.({ error: 'Use letters or numbers in the name.' });
        if (rooms.some((r) => r.id !== room.id && (r.id === name || r.name === name))) {
          return ack?.({ error: 'That name is taken.' });
        }
        room.name = name;
      }
      if (p?.icon !== undefined && GROUP_ICONS.includes(p.icon)) room.icon = p.icon;
      save();
      roomTarget(room).emit('room:update', room);
      if (room.name !== before) addSystem(room, `${user.name} renamed #${before} to #${room.name}`);
      ack?.({ room });
    });

    socket.on('room:delete', (p, ack) => {
      const user = socket.data.user;
      if (!user) return ack?.({ error: 'Join first.' });
      const room = rooms.find((r) => r.id === p?.id);
      if (!room) return ack?.({ error: 'That room does not exist.' });
      if (room.owner !== user.id) return ack?.({ error: 'Only the owner can delete this.' });
      roomTarget(room).emit('room:remove', { id: room.id });
      rooms.splice(rooms.indexOf(room), 1);
      delete history[room.id];
      for (const [, s] of io.sockets.sockets) s.leave(`room:${room.id}`);
      save();
      ack?.({ ok: true });
    });

    // any member of a private group can invite people
    socket.on('room:invite', (p, ack) => {
      const user = socket.data.user;
      if (!user) return ack?.({ error: 'Join first.' });
      const room = rooms.find((r) => r.id === p?.id);
      if (!room || !room.private || !canAccess(user, room.id)) return ack?.({ error: 'That group does not exist.' });
      const ids = (Array.isArray(p?.ids) ? p.ids : []).filter(
        (id) => typeof id === 'string' && users.has(id) && !room.members.includes(id)
      );
      if (!ids.length) return ack?.({ error: 'Pick someone who is not in the group yet.' });
      if (room.members.length + ids.length > MAX_MEMBERS) return ack?.({ error: 'That group is full.' });
      room.members.push(...ids);
      joinMembers(room);
      for (const id of ids) io.to(`user:${id}`).emit('room:new', room);
      save();
      io.to(`room:${room.id}`).emit('room:update', room);
      addSystem(room, `${user.name} added ${ids.map((id) => users.get(id).name).join(', ')}`);
      ack?.({ room });
    });

    // owner removes someone, or a member leaves
    const removeMember = (room, userId, text) => {
      room.members = room.members.filter((id) => id !== userId);
      for (const [, s] of io.sockets.sockets) if (s.data.user?.id === userId) s.leave(`room:${room.id}`);
      io.to(`user:${userId}`).emit('room:remove', { id: room.id });
      save();
      io.to(`room:${room.id}`).emit('room:update', room);
      addSystem(room, text);
    };

    socket.on('room:kick', (p, ack) => {
      const user = socket.data.user;
      if (!user) return ack?.({ error: 'Join first.' });
      const room = rooms.find((r) => r.id === p?.id);
      if (!room || !room.private || room.owner !== user.id) return ack?.({ error: 'Only the owner can remove people.' });
      if (p?.userId === user.id || !room.members.includes(p?.userId)) return ack?.({ error: 'That person is not in the group.' });
      removeMember(room, p.userId, `${user.name} removed ${users.get(p.userId)?.name || 'someone'}`);
      ack?.({ ok: true });
    });

    socket.on('room:leave', (p, ack) => {
      const user = socket.data.user;
      if (!user) return ack?.({ error: 'Join first.' });
      const room = rooms.find((r) => r.id === p?.id);
      if (!room || !room.private || !room.members.includes(user.id)) return ack?.({ error: 'You are not in that group.' });
      if (room.owner === user.id) return ack?.({ error: 'Owners cannot leave. Delete the group instead.' });
      removeMember(room, user.id, `${user.name} left`);
      ack?.({ ok: true });
    });

    socket.on('disconnect', () => {
      const user = socket.data.user;
      if (!user) return;
      const left = (connections.get(user.id) || 1) - 1;
      if (left <= 0) {
        connections.delete(user.id);
        const stored = users.get(user.id);
        if (stored) {
          stored.lastSeen = Date.now();
          save();
        }
      } else {
        connections.set(user.id, left);
      }
      io.emit('users', publicUsers());
    });
  });

  return io;
}
