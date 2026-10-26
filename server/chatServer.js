// Parley chat server. Attach it to any Node http.Server with attachChat(httpServer).
import { Server } from 'socket.io';
import { randomUUID, randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'parley.json');
// Bump this when the saved format changes in a way old data cannot be read.
// Data saved under any other number is discarded on start (that is how the v2 reset works).
const SCHEMA = 2;

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

const DEFAULT_ROOMS = [{ id: 'global', name: 'global', topic: 'Say hi to everyone', autoJoin: true }];

// ---- accounts ----
const USERNAME_RE = /^[A-Za-z][A-Za-z0-9_]{2,19}$/;
const RESERVED_NAMES = ['parley', 'system', 'admin', 'everyone', 'here', 'channel'];
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 128;
const SESSION_DAYS = 90; // a sign-in lasts this long without use...
const RENEW_AFTER_MS = 86_400_000; // ...and each visit pushes the end date out again (at most once a day)
const MAX_SESSIONS = 25; // per account; the least recently used sign-in is dropped past this
const MAX_FRIENDS = 200;
const MAX_FAVORITES = 20;
const MAX_EDIT_HISTORY = 5;
const MAX_BLOCKED = 200;
const MAX_OUTGOING_REQUESTS = 50;
const MAX_OWNED_ROOMS = 10;
const MAX_PUBLIC_MEMBERS_LISTED = 200;
// message requests: someone who is not your friend can send up to a few text-only messages
// until you accept. Keep BANNERS in sync with src/constants.js
const MAX_REQUEST_MSGS = 3;
const MAX_REQUEST_CHARS = 500;
const MAX_PENDING_OUT = 20;
const MAX_NOTES = 200;
const BANNERS = ['violet', 'sunset', 'ocean', 'forest', 'candy', 'slate', 'aurora', 'dusk'];
const DM_POLICIES = ['everyone', 'shared', 'friends'];

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

const cleanBio = (v) => String(v || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 300);
const cleanLocation = (v) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, 40);
// Profile picture: a small JPEG sent as a data URL (the client crops and shrinks it). '' removes it.
const cleanPhoto = (v) => {
  const raw = typeof v === 'string' ? v : '';
  return raw.length <= 70000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(raw) ? raw : '';
};
const cleanBanner = (v) => (BANNERS.includes(v) ? v : '');
const cleanWebsite = (v) => {
  const raw = String(v || '').trim().slice(0, 120);
  if (!raw) return '';
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!/^https?:$/.test(url.protocol) || !url.hostname.includes('.')) return '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
};
const cleanInterests = (v) => {
  const seen = new Set();
  const out = [];
  for (const x of Array.isArray(v) ? v : []) {
    const t = String(x || '').replace(/\s+/g, ' ').trim().slice(0, 20);
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push(t);
    }
  }
  return out.slice(0, 6);
};
const cleanNote = (v) => String(v || '').trim().slice(0, 200);
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
const MAX_MEMBERS = 50; // private groups

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
  // /pick pizza, tacos, sushi  -> the server chooses, so nobody can fake the draw
  const pick = /^\/pick\s+(.+)$/i.exec(text);
  if (pick) {
    const opts = pick[1].split(/\s*,\s*|\s+or\s+/i).map((o) => o.trim()).filter(Boolean).slice(0, 20);
    if (opts.length >= 2) return `picked: ${opts[Math.floor(Math.random() * opts.length)].slice(0, 100)} (from ${opts.length} options)`;
  }
  const ball = /^\/8ball(?:\s+(.+))?$/i.exec(text);
  if (ball) {
    const answers = [
      'It is certain.', 'Without a doubt.', 'Yes, definitely.', 'Most likely.', 'Signs point to yes.',
      'Ask again later.', 'Cannot predict now.', 'Better not tell you now.',
      "Don't count on it.", 'My sources say no.', 'Very doubtful.', 'Outlook not so good.',
    ];
    const q = (ball[1] || '').trim().slice(0, 120);
    return `shook the magic 8-ball${q ? ` (“${q}”)` : ''}: ${answers[Math.floor(Math.random() * answers.length)]}`;
  }
  return null;
};

// ---- passwords and sign-in tokens ----
const scryptAsync = (password, salt) =>
  new Promise((resolve, reject) =>
    scrypt(password, salt, 64, (err, key) => (err ? reject(err) : resolve(key)))
  );

const hashPassword = async (password) => {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt);
  return `s1$${salt.toString('base64')}$${key.toString('base64')}`;
};

const verifyPassword = async (password, stored) => {
  const [version, salt, key] = String(stored || '').split('$');
  if (version !== 's1' || !salt || !key) return false;
  const got = await scryptAsync(password, Buffer.from(salt, 'base64'));
  const want = Buffer.from(key, 'base64');
  return want.length === got.length && timingSafeEqual(want, got);
};

// Used when a username does not exist, so "no such user" takes as long as "wrong password".
let dummyHash = null;
const burnTime = async (password) => {
  dummyHash ||= await hashPassword('parley-dummy-password');
  await verifyPassword(password, dummyHash);
};

const newToken = () => randomBytes(32).toString('base64url');
const tokenHash = (token) => createHash('sha256').update(String(token)).digest('hex');

const loadSaved = () => {
  let raw;
  try {
    raw = fs.readFileSync(DATA_FILE, 'utf8');
  } catch {
    return { saved: {}, reset: false };
  }
  try {
    const data = JSON.parse(raw);
    if (data?.schema === SCHEMA) return { saved: data, reset: false };
  } catch {
    /* unreadable: treated like old data */
  }
  return { saved: {}, reset: true };
};

export function attachChat(httpServer) {
  const { saved, reset } = loadSaved();
  const users = new Map(Object.entries(saved.users || {})); // id -> account record (see register)
  const rooms = (saved.rooms?.length
    ? saved.rooms
    : DEFAULT_ROOMS.map((r) => ({ ...r, official: true }))
  ).map((r) => ({
    icon: '', owner: null, private: false, members: [], banned: [], createdAt: 0, ...r,
  }));
  const history = saved.history || {}; // roomId -> messages[]
  // Older data: "lobby" becomes "global" (same id, so history is kept) and the two starter rooms are removed.
  for (const r of rooms) if (r.id === 'lobby' && r.official) { r.name = 'global'; r.topic = r.topic || 'Say hi to everyone'; }
  for (const id of ['ideas', 'off-hours']) {
    const at = rooms.findIndex((r) => r.id === id && r.official);
    if (at >= 0) {
      rooms.splice(at, 1);
      delete history[id];
    }
  }
  const requests = saved.requests || []; // pending friend requests: { from, to, ts }
  // Message requests: dmId -> { from, to, state: 'pending' | 'declined' | 'accepted', sent, ts }
  const threads = saved.threads || {};
  const reads = saved.reads || {}; // dmId -> { userId: ts of their last read }
  const connections = new Map(); // userId -> open socket count
  const byName = new Map([...users.values()].map((u) => [u.key, u.id])); // lowercase username -> id

  const persist = () => {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(
        DATA_FILE,
        JSON.stringify({ schema: SCHEMA, users: Object.fromEntries(users), rooms, history, requests, threads, reads })
      );
    } catch {
      /* read-only file systems just skip persistence */
    }
  };
  let saveTimer = null;
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 400);
  };
  if (reset) {
    // Old (pre-accounts) data is wiped on purpose: overwrite it right away.
    persist();
    console.log('Parley: data from an older version was found and has been reset.');
  }

  const io = new Server(httpServer, {
    serveClient: false,
    cors: { origin: true },
    maxHttpBufferSize: 4e6, // room for resized images
    destroyUpgrade: false, // lets Vite's own HMR websocket coexist
  });

  // ---- sign-in throttling ----
  const tries = new Map(); // key -> { n, until, reset }
  const lockedFor = (key) => {
    const t = tries.get(key);
    if (!t) return 0;
    if (t.until > Date.now()) return Math.ceil((t.until - Date.now()) / 1000);
    if (t.reset < Date.now()) tries.delete(key);
    return 0;
  };
  const noteFail = (key) => {
    const now = Date.now();
    let t = tries.get(key);
    if (!t || t.reset < now) t = { n: 0, until: 0, reset: now + 15 * 60_000 };
    t.n += 1;
    if (t.n >= 6) {
      t.until = now + 60_000;
      t.n = 0;
    }
    tries.set(key, t);
  };
  setInterval(() => {
    const now = Date.now();
    for (const [k, t] of tries) if (t.reset < now && t.until < now) tries.delete(k);
  }, 10 * 60_000).unref();

  // ---- helpers ----
  const isDm = (id) => id.startsWith('dm:');
  const dmMembers = (id) => id.slice(3).split('|');
  const audience = (roomId) =>
    isDm(roomId) ? dmMembers(roomId).map((u) => `user:${u}`) : [`room:${roomId}`];

  const areFriends = (a, b) => !!users.get(a)?.friends.includes(b);

  // ---- blocking & privacy ----
  // A block works in both directions for delivery: neither person can message, call a friend request
  // or be added as a friend by the other. Only the blocker is told; the blocked person just sees
  // the usual "you can only message friends" behaviour.
  const hasBlocked = (a, b) => !!users.get(a)?.blocked?.includes(b);
  const isBlocked = (a, b) => hasBlocked(a, b) || hasBlocked(b, a);
  const privacyOf = (u) => ({
    requests: u?.privacy?.requests === 'nobody' ? 'nobody' : 'everyone',
    showOnline: u?.privacy?.showOnline !== false,
    dms: DM_POLICIES.includes(u?.privacy?.dms) ? u.privacy.dms : 'everyone',
    readReceipts: u?.privacy?.readReceipts !== false,
    calls: u?.privacy?.calls !== false,
  });
  const blockState = (id) =>
    (users.get(id)?.blocked || [])
      .map((x) => users.get(x))
      .filter(Boolean)
      .map((u) => ({ id: u.id, name: u.name, color: u.color }));
  const pushBlocked = (id) => io.to(`user:${id}`).emit('blocked', blockState(id));

  // ---- message requests ----
  const dmKey = (a, b) => 'dm:' + [a, b].sort().join('|');
  // The thread record, unless it is a declined request the viewer never wants to see again.
  const dmThreadFor = (roomId, viewerId) => {
    const t = threads[roomId];
    if (!t) return null;
    if (t.state === 'declined' && t.to === viewerId) return null;
    return t;
  };
  const hasSharedContext = (a, b) => {
    const fa = users.get(a)?.friends || [];
    const fb = users.get(b)?.friends || [];
    if (fa.some((x) => fb.includes(x))) return true;
    return rooms.some((r) => !r.official && !r.autoJoin && r.members.includes(a) && r.members.includes(b));
  };
  // What `a` may do when writing to `b`:
  //   open     normal conversation          request  first messages go to b's request inbox
  //   waiting  request sent, limit reached  no       b does not take messages from you
  //   blocked  either side blocked
  const dmAccess = (a, b) => {
    if (a === b || !users.has(a) || !users.has(b)) return { mode: 'no', reason: 'missing' };
    if (isBlocked(a, b)) return { mode: 'blocked' };
    if (areFriends(a, b)) return { mode: 'open' };
    const key = dmKey(a, b);
    const t = threads[key];
    if (t?.state === 'accepted') return { mode: 'open' };
    if (t && t.to === a) return { mode: 'open' }; // answering a request accepts it
    if (t && t.from === a) {
      const left = MAX_REQUEST_MSGS - (t.sent || 0);
      return left > 0 ? { mode: 'request', left, started: true } : { mode: 'waiting' };
    }
    const policy = privacyOf(users.get(b)).dms;
    if (policy === 'friends') return { mode: 'no', reason: 'friends' };
    if (policy === 'shared' && !hasSharedContext(a, b)) return { mode: 'no', reason: 'shared' };
    return { mode: 'request', left: MAX_REQUEST_MSGS, started: false };
  };
  // What a person sees of their message threads (a declined request just looks pending to its sender).
  const threadsFor = (id) => {
    const out = [];
    for (const [key, t] of Object.entries(threads)) {
      if (t.from !== id && t.to !== id) continue;
      if (t.state === 'declined' && t.to === id) continue;
      out.push({
        id: key,
        other: t.from === id ? t.to : t.from,
        incoming: t.to === id,
        state: t.state === 'accepted' ? 'accepted' : 'pending',
        sent: t.sent || 0,
        left: Math.max(0, MAX_REQUEST_MSGS - (t.sent || 0)),
        ts: t.ts,
      });
    }
    return out;
  };
  const pushThreads = (...ids) => {
    for (const id of ids) io.to(`user:${id}`).emit('dms', threadsFor(id));
  };
  const acceptThread = (a, b) => {
    const key = dmKey(a, b);
    const t = threads[key];
    if (!t || t.state === 'accepted') return false;
    t.state = 'accepted';
    return true;
  };
  // Read receipts: what `viewer` may see of the other person's last read time in each chat.
  const readsFor = (viewerId) => {
    const out = {};
    if (!privacyOf(users.get(viewerId)).readReceipts) return out;
    for (const [key, map] of Object.entries(reads)) {
      if (!isDm(key)) continue;
      const m = dmMembers(key);
      if (!m.includes(viewerId)) continue;
      const other = m[0] === viewerId ? m[1] : m[0];
      if (map[other] && privacyOf(users.get(other)).readReceipts) out[key] = map[other];
    }
    return out;
  };
  const pushReads = (id) => io.to(`user:${id}`).emit('reads', readsFor(id));

  // Live actions (send, react, type...) need access; DMs also need the two people to still be friends.
  const canAccess = (user, roomId) => {
    if (typeof roomId !== 'string') return false;
    if (isDm(roomId)) {
      const m = dmMembers(roomId);
      return (
        m.length === 2 &&
        m[0] !== m[1] &&
        m.includes(user.id) &&
        m.every((id) => users.has(id)) &&
        !isBlocked(m[0], m[1]) &&
        (areFriends(m[0], m[1]) || dmThreadFor(roomId, user.id))
      );
    }
    const room = rooms.find((r) => r.id === roomId);
    return !!room && room.members.includes(user.id);
  };

  // Live actions (typing, reacting, pinning, voting) need a real conversation, not just a pending request.
  const canLive = (user, roomId) => {
    if (!canAccess(user, roomId)) return false;
    if (!isDm(roomId)) return true;
    const [a, b] = dmMembers(roomId);
    return areFriends(a, b) || threads[roomId]?.state === 'accepted';
  };

  const visibleRooms = (userId) => rooms.filter((r) => r.members.includes(userId));

  // What a client is allowed to know about a room. Public rooms only send a head count
  // (their member list is fetched on request); the owner also sees the ban list.
  const roomView = (room, viewerId) => {
    const v = {
      id: room.id,
      name: room.name,
      topic: room.topic,
      icon: room.icon,
      owner: room.owner,
      private: room.private,
      official: !!room.official,
      createdAt: room.createdAt,
      count: room.members.length,
    };
    if (room.private) v.members = room.members;
    else if (room.owner && room.owner === viewerId) {
      v.banned = room.banned.map((id) => ({ id, name: users.get(id)?.name || 'Unknown' }));
    }
    return v;
  };
  const emitRoom = (event, room) => {
    for (const id of room.members) io.to(`user:${id}`).emit(event, roomView(room, id));
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
    io.to(`room:${room.id}`).emit('message:new', msg);
  };

  // ---- who can see whom ----
  // You know about: yourself, friends, people with a pending request to or from you,
  // people you share a room with, and people you have a DM with.
  const dmPartners = (id) => {
    const out = new Set();
    for (const key of Object.keys(history)) {
      if (!isDm(key)) continue;
      const m = dmMembers(key);
      if (m.includes(id) && (!threads[key] || dmThreadFor(key, id))) out.add(m[0] === id ? m[1] : m[0]);
    }
    return out;
  };
  const relatedIds = (id) => {
    const u = users.get(id);
    const set = new Set([id]);
    if (!u) return [];
    u.friends.forEach((x) => set.add(x));
    for (const r of requests) {
      if (r.from === id) set.add(r.to);
      else if (r.to === id) set.add(r.from);
    }
    for (const r of rooms) if (r.members.includes(id)) r.members.forEach((x) => set.add(x));
    dmPartners(id).forEach((x) => set.add(x));
    return [...set].filter((x) => users.has(x));
  };

  const publicUser = (u) => ({
    id: u.id,
    name: u.name,
    color: u.color,
    status: u.status || null,
    bio: u.bio || '',
    pronouns: u.pronouns || '',
    tz: u.tz || '',
    banner: u.banner || '',
    photo: u.photo || '',
    location: u.location || '',
    website: u.website || '',
    interests: u.interests || [],
    joinedAt: u.joinedAt,
    lastSeen: privacyOf(u).showOnline ? u.lastSeen || null : null,
    online: privacyOf(u).showOnline && (connections.get(u.id) || 0) > 0,
  });
  const usersFor = (id) => relatedIds(id).map((x) => publicUser(users.get(x)));
  const sendUsers = (id) => io.to(`user:${id}`).emit('users', usersFor(id));
  // Push one person's fresh profile/presence to everyone who can see them.
  const broadcastUser = (u) => {
    const targets = relatedIds(u.id).map((x) => `user:${x}`);
    if (targets.length) io.to(targets).emit('user:update', publicUser(u));
  };

  const friendState = (id) => {
    const u = users.get(id);
    const friends = [...(u?.friends || [])];
    const reqTs = {};
    for (const r of requests) {
      if (r.to === id) reqTs[r.from] = r.ts || 0;
      else if (r.from === id) reqTs[r.to] = r.ts || 0;
    }
    return {
      friends,
      incoming: requests.filter((r) => r.to === id).map((r) => r.from),
      outgoing: requests.filter((r) => r.from === id).map((r) => r.to),
      favorites: (u?.favorites || []).filter((x) => friends.includes(x)),
      since: Object.fromEntries(Object.entries(u?.since || {}).filter(([x]) => friends.includes(x))),
      reqTs,
    };
  };
  // Make two people friends (and remember since when).
  const makeFriends = (a, b) => {
    const now = Date.now();
    for (const [x, y] of [[a, b], [b, a]]) {
      const u = users.get(x);
      if (!u.friends.includes(y)) u.friends.push(y);
      (u.since ||= {})[y] = u.since[y] || now;
    }
  };
  // Forget everything a friendship stored.
  const unmakeFriends = (a, b) => {
    for (const [x, y] of [[a, b], [b, a]]) {
      const u = users.get(x);
      if (!u) continue;
      u.friends = u.friends.filter((id) => id !== y);
      u.favorites = (u.favorites || []).filter((id) => id !== y);
      if (u.since) delete u.since[y];
    }
  };
  const pushFriends = (...ids) => {
    for (const id of ids) {
      io.to(`user:${id}`).emit('friends', friendState(id));
      sendUsers(id);
    }
  };

  // Sign out every open connection of an account except the one carrying `keepHash`.
  const endSockets = (userId, keepHash) => {
    for (const [, s] of io.sockets.sockets) {
      if (s.data.user?.id === userId && s.data.tokenHash !== keepHash) {
        s.emit('auth:ended');
        s.disconnect(true);
      }
    }
  };

  const historyFor = (userId) => {
    const out = {};
    for (const r of visibleRooms(userId)) out[r.id] = history[r.id] || [];
    // DMs stay readable after an unfriend; they just cannot be added to.
    for (const key of Object.keys(history)) {
      if (isDm(key) && dmMembers(key).includes(userId) && (!threads[key] || dmThreadFor(key, userId))) out[key] = history[key];
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

  const addMember = (room, userId) => {
    if (room.members.includes(userId)) return;
    room.members.push(userId);
    io.in(`user:${userId}`).socketsJoin(`room:${room.id}`);
  };
  const dropMember = (room, userId) => {
    room.members = room.members.filter((id) => id !== userId);
    io.in(`user:${userId}`).socketsLeave(`room:${room.id}`);
  };

  // ---- calls ----
  // One-to-one voice and video. The server only relays the handshake (who is calling, the WebRTC
  // offer/answer and network candidates); audio and video travel straight between the two browsers.
  const RING_MS = 45_000;
  const calls = new Map(); // call id -> { id, from, to, video, state, fromSocket, toSocket, answeredAt, timer }
  const callOf = new Map(); // user id -> call id (nobody is in two calls at once)
  const ICE_SERVERS = (() => {
    // Add a TURN server for people behind strict firewalls: PARLEY_ICE_SERVERS='[{"urls":"turn:...","username":"..","credential":".."}]'
    try {
      const v = JSON.parse(process.env.PARLEY_ICE_SERVERS || '');
      if (Array.isArray(v) && v.length) return v;
    } catch {}
    return [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  })();

  const fmtLength = (ms) => {
    const t = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const sec = String(t % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
  };

  // A small notice in the conversation. Missed calls count as unread; the rest stay quiet.
  const callNotice = (key, text, missed = false) => {
    const msg = {
      id: randomUUID(), cid: '', room: key, text, image: null, poll: null, action: false,
      pinned: false, replyTo: null, system: true, call: true, missed, quiet: !missed,
      user: { id: 'system', name: 'Parley', color: '#888888' },
      ts: Date.now(), reactions: {}, edited: false, deleted: false,
    };
    (history[key] ||= []).push(msg);
    if (history[key].length > MAX_HISTORY) history[key].splice(0, history[key].length - MAX_HISTORY);
    save();
    io.to(audience(key)).emit('message:new', msg);
  };

  const endCall = (call, reason) => {
    if (!calls.delete(call.id)) return;
    clearTimeout(call.timer);
    if (callOf.get(call.from) === call.id) callOf.delete(call.from);
    if (callOf.get(call.to) === call.id) callOf.delete(call.to);
    // every open tab of both people hears about it; tabs that never knew this call ignore it
    io.to(`user:${call.from}`).to(`user:${call.to}`).emit('call:ended', { id: call.id, reason });
    const key = dmKey(call.from, call.to);
    const caller = users.get(call.from);
    const callee = users.get(call.to);
    const kind = call.video ? 'video call' : 'call';
    if (call.state === 'active') {
      callNotice(key, `${call.video ? 'Video call' : 'Call'} ended · ${fmtLength(Date.now() - call.answeredAt)}`);
    } else if (reason === 'declined') {
      callNotice(key, `${callee?.name || 'They'} declined the ${kind}`);
    } else if (reason === 'missed' || reason === 'cancelled') {
      callNotice(key, `Missed ${kind} from ${caller?.name || 'someone'}`, true);
    }
  };
  const endCallsBetween = (a, b, reason = 'ended') => {
    for (const c of [...calls.values()]) {
      if ((c.from === a && c.to === b) || (c.from === b && c.to === a)) endCall(c, reason);
    }
  };

  // ---- connections ----
  io.on('connection', (socket) => {
    // Everything after sign-in goes through this: wire the socket to the account's rooms
    // and hand the client its starting state.
    const attach = (user, token) => {
      socket.data.user = user;
      socket.data.tokenHash = token ? tokenHash(token) : socket.data.tokenHash;
      socket.join(`user:${user.id}`);
      visibleRooms(user.id).forEach((r) => socket.join(`room:${r.id}`));
      connections.set(user.id, (connections.get(user.id) || 0) + 1);
      broadcastUser(user);
      return {
        user: publicUser(user),
        token,
        rooms: visibleRooms(user.id).map((r) => roomView(r, user.id)),
        users: usersFor(user.id),
        history: historyFor(user.id),
        friends: friendState(user.id),
        blocked: blockState(user.id),
        privacy: privacyOf(user),
        dms: threadsFor(user.id),
        reads: readsFor(user.id),
      };
    };

    const startSession = (user) => {
      const now = Date.now();
      const token = newToken();
      user.sessions = (user.sessions || []).filter((s) => s.exp > now);
      user.sessions.push({ h: tokenHash(token), at: now, seen: now, exp: now + SESSION_DAYS * 86_400_000 });
      if (user.sessions.length > MAX_SESSIONS) {
        user.sessions.sort((a, b) => (a.seen || a.at) - (b.seen || b.at));
        user.sessions = user.sessions.slice(-MAX_SESSIONS);
      }
      // Written straight away (not on the usual short delay) so a restart right after signing in can't lose it.
      clearTimeout(saveTimer);
      persist();
      return token;
    };

    const authGate = (ack) => {
      if (socket.data.user) {
        ack?.({ error: 'Already signed in.' });
        return false;
      }
      // per-connection brake on guessing: 8 attempts per 30 seconds
      const now = Date.now();
      const recent = (socket.data.authTimes || []).filter((t) => now - t < 30_000);
      if (recent.length >= 8) {
        ack?.({ error: 'Too many attempts. Wait a moment and try again.' });
        return false;
      }
      recent.push(now);
      socket.data.authTimes = recent;
      return true;
    };

    socket.on('auth:register', async (p, ack) => {
      if (!authGate(ack)) return;
      const username = typeof p?.username === 'string' ? p.username.trim() : '';
      const password = typeof p?.password === 'string' ? p.password : '';
      if (!USERNAME_RE.test(username)) {
        return ack?.({ error: 'Usernames are 3 to 20 characters: letters, numbers or _, starting with a letter.' });
      }
      if (RESERVED_NAMES.includes(username.toLowerCase())) return ack?.({ error: 'That username is not available.' });
      if (password.length < MIN_PASSWORD) return ack?.({ error: `Use at least ${MIN_PASSWORD} characters for your password.` });
      if (password.length > MAX_PASSWORD) return ack?.({ error: 'That password is too long.' });
      if (password.toLowerCase() === username.toLowerCase()) return ack?.({ error: 'Your password cannot be your username.' });
      if (byName.has(username.toLowerCase())) return ack?.({ error: 'That username is taken.' });
      if ((socket.data.registered || 0) >= 3) return ack?.({ error: 'Too many accounts created from this connection.' });

      let pass;
      try {
        pass = await hashPassword(password);
      } catch {
        return ack?.({ error: 'Something went wrong. Try again.' });
      }
      // another request may have taken the name while we were hashing
      if (byName.has(username.toLowerCase())) return ack?.({ error: 'That username is taken.' });
      if (socket.data.user) return ack?.({ error: 'Already signed in.' });

      const id = randomUUID();
      const user = {
        id,
        name: username,
        key: username.toLowerCase(),
        pass,
        sessions: [],
        color: colorFor(id),
        status: null,
        bio: '',
        pronouns: '',
        tz: '',
        joinedAt: Date.now(),
        lastSeen: null,
        friends: [],
        blocked: [],
        privacy: { requests: 'everyone', showOnline: true },
      };
      users.set(id, user);
      byName.set(user.key, id);
      socket.data.registered = (socket.data.registered || 0) + 1;
      for (const r of rooms) if (r.autoJoin && !r.private) addMember(r, id);
      const token = startSession(user);
      const payload = attach(user, token);
      for (const r of rooms) if (r.autoJoin) emitRoom('room:update', r); // new head count
      save();
      ack?.(payload);
    });

    socket.on('auth:login', async (p, ack) => {
      if (!authGate(ack)) return;
      const username = typeof p?.username === 'string' ? p.username.trim().toLowerCase() : '';
      const password = typeof p?.password === 'string' ? p.password.slice(0, MAX_PASSWORD) : '';
      if (!username || !password) return ack?.({ error: 'Enter your username and password.' });

      const lock = lockedFor(`u:${username}`);
      if (lock) return ack?.({ error: `Too many wrong passwords. Try again in ${lock} seconds.` });

      const user = users.get(byName.get(username));
      let ok = false;
      try {
        if (user) ok = await verifyPassword(password, user.pass);
        else await burnTime(password);
      } catch {
        return ack?.({ error: 'Something went wrong. Try again.' });
      }
      if (!ok) {
        noteFail(`u:${username}`);
        return ack?.({ error: 'Wrong username or password.' });
      }
      if (socket.data.user) return ack?.({ error: 'Already signed in.' });
      tries.delete(`u:${username}`);
      const token = startSession(user);
      ack?.(attach(user, token));
    });

    // Picks a saved session back up (page reload, reconnect)
    socket.on('auth:resume', (p, ack) => {
      if (socket.data.user) return ack?.({ error: 'Already signed in.' });
      const h = typeof p?.token === 'string' && p.token.length < 200 ? tokenHash(p.token) : null;
      const now = Date.now();
      let user = null;
      let sess = null;
      if (h) {
        for (const u of users.values()) {
          const found = u.sessions?.find((s) => s.h === h && s.exp > now);
          if (found) {
            user = u;
            sess = found;
            break;
          }
        }
      }
      if (!user) return ack?.({ error: 'Your session has ended. Please sign in again.', expired: true });
      // Staying signed in: every visit extends the sign-in, so only a long absence ends it.
      if (now - (sess.seen || sess.at) > RENEW_AFTER_MS) {
        sess.seen = now;
        sess.exp = now + SESSION_DAYS * 86_400_000;
        save();
      }
      socket.data.tokenHash = h;
      ack?.(attach(user, undefined));
    });

    socket.on('auth:logout', (_p, ack) => {
      const user = socket.data.user;
      if (user && socket.data.tokenHash) {
        user.sessions = (user.sessions || []).filter((s) => s.h !== socket.data.tokenHash);
        save();
        // other tabs signed in with the same session end too
        for (const [, s] of io.sockets.sockets) {
          if (s !== socket && s.data.tokenHash === socket.data.tokenHash) {
            s.emit('auth:ended');
            s.disconnect(true);
          }
        }
      }
      ack?.({ ok: true });
    });

    socket.on('auth:password', async (p, ack) => {
      const user = socket.data.user;
      if (!user) return ack?.({ error: 'Sign in first.' });
      const current = typeof p?.current === 'string' ? p.current.slice(0, MAX_PASSWORD) : '';
      const next = typeof p?.next === 'string' ? p.next : '';
      if (lockedFor(`pw:${user.id}`)) return ack?.({ error: 'Too many wrong passwords. Try again in a minute.' });
      if (next.length < MIN_PASSWORD) return ack?.({ error: `Use at least ${MIN_PASSWORD} characters for the new password.` });
      if (next.length > MAX_PASSWORD) return ack?.({ error: 'That password is too long.' });
      if (next.toLowerCase() === user.name.toLowerCase()) return ack?.({ error: 'Your password cannot be your username.' });
      try {
        if (!(await verifyPassword(current, user.pass))) {
          noteFail(`pw:${user.id}`);
          return ack?.({ error: 'Your current password is not right.' });
        }
        user.pass = await hashPassword(next);
      } catch {
        return ack?.({ error: 'Something went wrong. Try again.' });
      }
      // everyone else who was signed in is signed out
      user.sessions = (user.sessions || []).filter((s) => s.h === socket.data.tokenHash);
      save();
      endSockets(user.id, socket.data.tokenHash);
      ack?.({ ok: true });
    });

    socket.on('message:send', (p, ack) => {
      const user = socket.data.user;
      if (!user) return ack?.({ error: 'Sign in first.' });

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
      if (!text && !image && !poll && !p?.forward) return ack?.({ error: 'Message is empty.' });

      const room = String(p?.room || '');
      // Direct messages: friends and accepted chats are open; anyone else goes through a message request.
      let request = null;
      if (isDm(room)) {
        const m = dmMembers(room);
        if (m.length !== 2 || m[0] === m[1] || !m.includes(user.id) || !m.every((id) => users.has(id))) {
          return ack?.({ error: 'That conversation does not exist.' });
        }
        const other = m[0] === user.id ? m[1] : m[0];
        const access = dmAccess(user.id, other);
        const name = users.get(other).name;
        if (access.mode === 'blocked') return ack?.({ error: 'You can only message friends.' });
        if (access.mode === 'no') {
          return ack?.({
            error:
              access.reason === 'friends'
                ? `${name} only takes messages from friends.`
                : access.reason === 'shared'
                ? `${name} only takes messages from friends and people they share a group with.`
                : 'That person no longer exists.',
          });
        }
        if (access.mode === 'waiting') {
          return ack?.({ error: `Wait for ${name} to accept your message request before sending more.` });
        }
        if (access.mode === 'request') {
          if (image || poll || p?.forward) return ack?.({ error: 'Message requests can only contain text.' });
          if (text.length > MAX_REQUEST_CHARS) return ack?.({ error: `Message requests are limited to ${MAX_REQUEST_CHARS} characters.` });
          if (!access.started) {
            const open = Object.values(threads).filter((t) => t.from === user.id && t.state !== 'accepted').length;
            if (open >= MAX_PENDING_OUT) return ack?.({ error: 'You have too many unanswered message requests.' });
          }
          request = { other, started: access.started };
        }
      } else if (!canAccess(user, room)) {
        return ack?.({ error: 'You are not in that room.' });
      }

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

      // Forwarding copies a message you can see; the label comes from the original, so it cannot be faked.
      let forwarded = null;
      let sendText = text;
      let sendImage = image;
      if (p?.forward && typeof p.forward === 'object') {
        const srcRoom = String(p.forward.room || '');
        const orig = canAccess(user, srcRoom) ? findMessage(srcRoom, p.forward.id) : null;
        if (!orig || orig.deleted || (!orig.text && !orig.image)) return ack?.({ error: 'That message can no longer be forwarded.' });
        forwarded = { name: orig.user.name, ts: orig.ts };
        sendText = String(orig.text || '').slice(0, 2000);
        sendImage = orig.image || null;
        action = false;
      }

      const msg = {
        id: randomUUID(),
        cid: String(p?.cid || '').slice(0, 64),
        room,
        text: sendText,
        image: sendImage,
        poll,
        action,
        pinned: false,
        forwarded,
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

      if (request) {
        // First contact: open (or keep using) the thread and put it in the other person's request inbox.
        const t = (threads[room] ||= { from: user.id, to: request.other, state: 'pending', sent: 0, ts: Date.now() });
        t.sent = (t.sent || 0) + 1;
        save();
        if (t.state === 'declined') {
          io.to(`user:${user.id}`).emit('message:new', msg); // the sender is never told it was declined
        } else {
          sendUsers(request.other);
          pushThreads(user.id, request.other);
          io.to(audience(room)).emit('message:new', msg);
          if (!request.started) {
            io.to(`user:${request.other}`).emit('dm:request', { id: room, from: { id: user.id, name: user.name }, text: msg.text.slice(0, 140) });
          }
        }
        return ack?.({ ok: true, request: true });
      }
      // Answering someone's request (or writing first to someone who declined you) opens the chat.
      if (isDm(room) && acceptThread(user.id, dmMembers(room).find((id) => id !== user.id))) {
        const other = dmMembers(room).find((id) => id !== user.id);
        pushThreads(user.id, other);
        io.to(`user:${other}`).emit('dm:accepted', { id: room, by: { id: user.id, name: user.name } });
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
      if (text === msg.text) return;
      // keep the last few earlier versions so readers can see what changed
      const prev = [...(msg.prev || []), { text: msg.text || '', ts: msg.editedAt || msg.ts }].slice(-MAX_EDIT_HISTORY);
      patchMessage(room, msg, { text, edited: true, editedAt: Date.now(), prev });
    });

    socket.on('message:delete', (p) => {
      const user = socket.data.user;
      const room = String(p?.room || '');
      if (!user || !canAccess(user, room)) return;
      const msg = findMessage(room, p?.id);
      if (!msg || msg.user.id !== user.id || msg.deleted) return;
      patchMessage(room, msg, { deleted: true, text: '', image: null, reactions: {}, prev: [] });
    });

    socket.on('message:pin', (p) => {
      const user = socket.data.user;
      const room = String(p?.room || '');
      if (!user || !canLive(user, room)) return;
      const msg = findMessage(room, p?.id);
      if (!msg || msg.deleted) return;
      const pinned = !msg.pinned;
      patchMessage(room, msg, { pinned, pinnedBy: pinned ? user.name : null });
    });

    socket.on('poll:vote', (p) => {
      const user = socket.data.user;
      const room = String(p?.room || '');
      if (!user || !canLive(user, room)) return;
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
      if (!user || !canLive(user, room)) return;
      socket.to(audience(room)).emit('typing', { room, user: { id: user.id, name: user.name } });
    });

    socket.on('react', (p) => {
      const user = socket.data.user;
      const room = String(p?.room || '');
      if (!user || !canLive(user, room) || !REACTIONS.includes(p?.emoji)) return;
      const msg = findMessage(room, p.messageId);
      if (!msg || msg.deleted) return;
      const list = (msg.reactions[p.emoji] ||= []);
      const at = list.indexOf(user.id);
      if (at >= 0) list.splice(at, 1);
      else list.push(user.id);
      if (!list.length) delete msg.reactions[p.emoji];
      patchMessage(room, msg, { reactions: msg.reactions });
    });

    socket.on('profile:update', (p, ack) => {
      const user = socket.data.user;
      if (!user) return ack?.({ error: 'Sign in first.' });
      const patch = {};
      if (p?.color !== undefined) {
        if (!COLORS.includes(p.color)) return;
        patch.color = p.color;
      }
      if (p?.status !== undefined) patch.status = cleanStatus(p.status);
      if (p?.bio !== undefined) patch.bio = cleanBio(p.bio);
      if (p?.pronouns !== undefined) patch.pronouns = cleanPronouns(p.pronouns);
      if (p?.tz !== undefined) patch.tz = cleanTz(p.tz);
      if (p?.banner !== undefined) patch.banner = cleanBanner(p.banner);
      if (p?.photo !== undefined) {
        patch.photo = cleanPhoto(p.photo);
        if (p.photo && !patch.photo) return ack?.({ error: 'That picture could not be used. Try a smaller one.' });
      }
      if (p?.location !== undefined) patch.location = cleanLocation(p.location);
      if (p?.website !== undefined) patch.website = cleanWebsite(p.website);
      if (p?.interests !== undefined) patch.interests = cleanInterests(p.interests);
      if (!Object.keys(patch).length) return;
      Object.assign(user, patch); // socket.data.user is the stored record itself
      save();
      broadcastUser(user);
      ack?.({ ok: true, user: publicUser(user) });
    });

    // A full profile as the viewer sees it: mutual friends and groups, their private note, and
    // whether (and how) they can message this person.
    socket.on('profile:get', (p, ack) => {
      const user = socket.data.user;
      if (!user) return ack?.({ error: 'Sign in first.' });
      const id = typeof p?.id === 'string' ? p.id : '';
      const other = users.get(id);
      if (!other || !relatedIds(user.id).includes(id)) return ack?.({ error: 'That profile is not available.' });
      const mine = new Set(user.friends);
      const mutual = other.friends
        .filter((x) => mine.has(x) && x !== user.id && !isBlocked(user.id, x))
        .map((x) => users.get(x))
        .filter(Boolean);
      const shared = rooms.filter((r) => !r.official && !r.autoJoin && r.members.includes(user.id) && r.members.includes(id));
      ack?.({
        id,
        mutualFriends: mutual.slice(0, 8).map((u) => ({ id: u.id, name: u.name, color: u.color })),
        mutualFriendCount: mutual.length,
        mutualRooms: shared.slice(0, 8).map((r) => ({ id: r.id, name: r.name, icon: r.icon, private: r.private })),
        mutualRoomCount: shared.length,
        note: user.notes?.[id] || '',
        dm: id === user.id ? { mode: 'no', reason: 'self' } : dmAccess(user.id, id),
      });
    });

    // A private note about someone. Only you ever see it.
    socket.on('profile:note', (p, ack) => {
      const user = socket.data.user;
      if (!user) return ack?.({ error: 'Sign in first.' });
      const id = typeof p?.id === 'string' ? p.id : '';
      if (!users.has(id) || id === user.id) return ack?.({ error: 'That person no longer exists.' });
      const text = cleanNote(p?.text);
      user.notes ||= {};
      if (text) {
        if (!user.notes[id] && Object.keys(user.notes).length >= MAX_NOTES) return ack?.({ error: 'You have too many notes.' });
        user.notes[id] = text;
      } else {
        delete user.notes[id];
      }
      save();
      ack?.({ ok: true, note: text });
    });

    // ---- friends ----
    const friendTarget = (ack, id) => {
      const other = users.get(typeof id === 'string' ? id : '');
      if (!other) {
        ack?.({ error: 'That person no longer exists.' });
        return null;
      }
      return other;
    };

    socket.on('friend:request', (p, ack) => {
      const user = socket.data.user;
      if (!user) return ack?.({ error: 'Sign in first.' });
      const name = typeof p?.username === 'string' ? p.username.trim().replace(/^@/, '').toLowerCase() : '';
      const byIdTarget = typeof p?.id === 'string' ? users.get(p.id) : null;
      if (!name && !byIdTarget) return ack?.({ error: 'Type a username.' });
      const other = byIdTarget || users.get(byName.get(name));
      if (!other) return ack?.({ error: 'Nobody has that username.' });
      if (other.id === user.id) return ack?.({ error: 'That is you.' });
      if (areFriends(user.id, other.id)) return ack?.({ error: `You and ${other.name} are already friends.` });
      if (hasBlocked(user.id, other.id)) return ack?.({ error: `You blocked ${other.name}. Unblock them first.` });
      if (hasBlocked(other.id, user.id)) return ack?.({ error: 'That request could not be sent.' });
      if (requests.some((r) => r.from === user.id && r.to === other.id)) {
        return ack?.({ error: `You already asked ${other.name}.` });
      }
      // they already asked you: that is a yes
      const theirs = requests.findIndex((r) => r.from === other.id && r.to === user.id);
      if (theirs >= 0) {
        requests.splice(theirs, 1);
        makeFriends(user.id, other.id);
        acceptThread(user.id, other.id);
        save();
        pushFriends(user.id, other.id);
        pushThreads(user.id, other.id);
        return ack?.({ ok: true, accepted: true, name: other.name });
      }
      if (privacyOf(other).requests === 'nobody') return ack?.({ error: `${other.name} is not accepting friend requests.` });
      if (user.friends.length >= MAX_FRIENDS) return ack?.({ error: 'Your friends list is full.' });
      if (requests.filter((r) => r.from === user.id).length >= MAX_OUTGOING_REQUESTS) {
        return ack?.({ error: 'You have too many pending requests. Cancel some first.' });
      }
      requests.push({ from: user.id, to: other.id, ts: Date.now() });
      save();
      pushFriends(user.id, other.id);
      io.to(`user:${other.id}`).emit('friend:incoming', { id: user.id, name: user.name });
      ack?.({ ok: true, name: other.name });
    });

    socket.on('friend:accept', (p, ack) => {
      const user = socket.data.user;
      if (!user) return ack?.({ error: 'Sign in first.' });
      const other = friendTarget(ack, p?.id);
      if (!other) return;
      const at = requests.findIndex((r) => r.from === other.id && r.to === user.id);
      if (at < 0) return ack?.({ error: 'That request is no longer there.' });
      if (isBlocked(user.id, other.id)) return ack?.({ error: 'That request is no longer there.' });
      if (user.friends.length >= MAX_FRIENDS) return ack?.({ error: 'Your friends list is full.' });
      requests.splice(at, 1);
      makeFriends(user.id, other.id);
      acceptThread(user.id, other.id);
      save();
      pushFriends(user.id, other.id);
      pushThreads(user.id, other.id);
      ack?.({ ok: true });
    });

    // decline (theirs) or cancel (yours): both just remove the pending request
    const dropRequest = (fromMe) => (p, ack) => {
      const user = socket.data.user;
      if (!user) return ack?.({ error: 'Sign in first.' });
      const id = typeof p?.id === 'string' ? p.id : '';
      const at = requests.findIndex((r) => (fromMe ? r.from === user.id && r.to === id : r.from === id && r.to === user.id));
      if (at < 0) return ack?.({ ok: true });
      requests.splice(at, 1);
      save();
      pushFriends(user.id, id);
      ack?.({ ok: true });
    };
    socket.on('friend:decline', dropRequest(false));
    socket.on('friend:cancel', dropRequest(true));

    socket.on('friend:remove', (p, ack) => {
      const user = socket.data.user;
      if (!user) return ack?.({ error: 'Sign in first.' });
      const other = friendTarget(ack, p?.id);
      if (!other) return;
      unmakeFriends(user.id, other.id);
      delete threads[dmKey(user.id, other.id)]; // unfriending closes the chat again
      save();
      pushFriends(user.id, other.id);
      pushThreads(user.id, other.id);
      ack?.({ ok: true });
    });

    // Star a friend so they sit at the top of your list.
    socket.on('friend:favorite', (p, ack) => {
      const user = socket.data.user;
      if (!user) return ack?.({ error: 'Sign in first.' });
      const id = typeof p?.id === 'string' ? p.id : '';
      if (!user.friends.includes(id)) return ack?.({ error: 'You can only favorite friends.' });
      const list = (user.favorites ||= []).filter((x) => user.friends.includes(x));
      const at = list.indexOf(id);
      if (at >= 0) list.splice(at, 1);
      else {
        if (list.length >= MAX_FAVORITES) return ack?.({ error: `You can favorite up to ${MAX_FAVORITES} friends.` });
        list.push(id);
      }
      user.favorites = list;
      save();
      pushFriends(user.id);
      ack?.({ ok: true, favorite: at < 0 });
    });

    // People you may know: friends of friends and people from your private groups, ranked by overlap.
    socket.on('friend:suggestions', (_p, ack) => {
      const user = socket.data.user;
      if (!user) return ack?.({ error: 'Sign in first.' });
      const asked = new Set(requests.filter((r) => r.from === user.id || r.to === user.id).flatMap((r) => [r.from, r.to]));
      const mine = new Set(user.friends);
      const score = new Map(); // id -> { mutual, groups }
      const bump = (id, key) => {
        if (id === user.id || mine.has(id) || asked.has(id) || !users.has(id)) return;
        if (isBlocked(user.id, id) || privacyOf(users.get(id)).requests === 'nobody') return;
        const e = score.get(id) || { mutual: 0, groups: 0 };
        e[key] += 1;
        score.set(id, e);
      };
      for (const f of user.friends) for (const ff of users.get(f)?.friends || []) bump(ff, 'mutual');
      for (const r of rooms) {
        if (r.official || r.autoJoin || !r.members.includes(user.id)) continue;
        for (const m of r.members) bump(m, 'groups');
      }
      const list = [...score.entries()]
        .sort((a, b) => b[1].mutual * 2 + b[1].groups - (a[1].mutual * 2 + a[1].groups))
        .slice(0, 8)
        .map(([id, e]) => ({ ...publicUser(users.get(id)), mutual: e.mutual, groups: e.groups }));
      ack?.({ ok: true, list });
    });

    socket.on('user:block', (p, ack) => {
      const user = socket.data.user;
      if (!user) return ack?.({ error: 'Sign in first.' });
      const other = friendTarget(ack, p?.id);
      if (!other) return;
      if (other.id === user.id) return ack?.({ error: 'You cannot block yourself.' });
      user.blocked ||= [];
      if (!user.blocked.includes(other.id)) {
        if (user.blocked.length >= MAX_BLOCKED) return ack?.({ error: 'Your block list is full.' });
        user.blocked.push(other.id);
      }
      // blocking ends any friendship and clears pending requests in both directions
      unmakeFriends(user.id, other.id);
      for (let i = requests.length - 1; i >= 0; i--) {
        const r = requests[i];
        if ((r.from === user.id && r.to === other.id) || (r.from === other.id && r.to === user.id)) requests.splice(i, 1);
      }
      delete threads[dmKey(user.id, other.id)];
      endCallsBetween(user.id, other.id);
      save();
      pushFriends(user.id, other.id);
      pushThreads(user.id, other.id);
      pushBlocked(user.id);
      ack?.({ ok: true, name: other.name });
    });

    socket.on('user:unblock', (p, ack) => {
      const user = socket.data.user;
      if (!user) return ack?.({ error: 'Sign in first.' });
      const id = typeof p?.id === 'string' ? p.id : '';
      user.blocked = (user.blocked || []).filter((x) => x !== id);
      save();
      pushBlocked(user.id);
      ack?.({ ok: true });
    });

    socket.on('privacy:update', (p, ack) => {
      const user = socket.data.user;
      if (!user) return ack?.({ error: 'Sign in first.' });
      const next = privacyOf(user);
      if (p?.requests === 'everyone' || p?.requests === 'nobody') next.requests = p.requests;
      if (typeof p?.showOnline === 'boolean') next.showOnline = p.showOnline;
      if (DM_POLICIES.includes(p?.dms)) next.dms = p.dms;
      if (typeof p?.readReceipts === 'boolean') next.readReceipts = p.readReceipts;
      if (typeof p?.calls === 'boolean') next.calls = p.calls;
      user.privacy = next;
      save();
      broadcastUser(user);
      io.to(`user:${user.id}`).emit('privacy', next);
      // read receipts work both ways, so everyone you chat with sees a fresh picture too
      pushReads(user.id);
      relatedIds(user.id).filter((x) => x !== user.id).forEach(pushReads);
      ack?.({ ok: true, privacy: next });
    });

    // ---- message requests ----
    const requestFrom = (ack, id) => {
      const user = socket.data.user;
      if (!user) {
        ack?.({ error: 'Sign in first.' });
        return null;
      }
      const key = dmKey(user.id, typeof id === 'string' ? id : '');
      const t = threads[key];
      if (!t || t.to !== user.id || t.state === 'accepted') {
        ack?.({ error: 'That request is no longer there.' });
        return null;
      }
      return { user, key, t, other: users.get(t.from) };
    };

    socket.on('dm:accept', (p, ack) => {
      const r = requestFrom(ack, p?.id);
      if (!r) return;
      if (!r.other || isBlocked(r.user.id, r.other.id)) return ack?.({ error: 'That request is no longer there.' });
      r.t.state = 'accepted';
      save();
      pushThreads(r.user.id, r.other.id);
      io.to(`user:${r.other.id}`).emit('dm:accepted', { id: r.key, by: { id: r.user.id, name: r.user.name } });
      ack?.({ ok: true, id: r.key });
    });

    // Delete: the request disappears for you and the sender is not told. They can send a couple more
    // messages, then they are stuck waiting. Writing to them yourself later opens the chat.
    socket.on('dm:decline', (p, ack) => {
      const r = requestFrom(ack, p?.id);
      if (!r) return;
      r.t.state = 'declined';
      save();
      pushThreads(r.user.id);
      io.to(`user:${r.user.id}`).emit('dm:remove', { id: r.key });
      if (r.other) sendUsers(r.user.id);
      ack?.({ ok: true });
    });

    // Tell the other side how far you have read, so they can show "Seen".
    socket.on('read', (p) => {
      const user = socket.data.user;
      const room = String(p?.room || '');
      if (!user || !isDm(room) || !canLive(user, room)) return;
      const map = (reads[room] ||= {});
      const now = Date.now();
      if (now - (map[user.id] || 0) < 250) return;
      map[user.id] = now;
      save();
      if (!privacyOf(user).readReceipts) return;
      const other = dmMembers(room).find((id) => id !== user.id);
      if (privacyOf(users.get(other)).readReceipts) io.to(`user:${other}`).emit('read:update', { room, ts: now });
    });

    // ---- rooms ----
    // Public rooms you can find and join (a directory, never message content)
    socket.on('rooms:browse', (p, ack) => {
      const user = socket.data.user;
      if (!user) return ack?.({ error: 'Sign in first.' });
      const q = String(p?.q || '').trim().toLowerCase().slice(0, 40);
      const list = rooms
        .filter((r) => !r.private && !r.banned.includes(user.id))
        .filter((r) => !q || r.name.includes(q) || r.topic.toLowerCase().includes(q))
        .map((r) => ({
          id: r.id,
          name: r.name,
          topic: r.topic,
          icon: r.icon,
          count: r.members.length,
          official: !!r.official,
          owner: r.owner ? users.get(r.owner)?.name || null : null,
          joined: r.members.includes(user.id),
          createdAt: r.createdAt,
        }))
        .sort((a, b) => Number(b.joined) - Number(a.joined) || b.count - a.count || a.name.localeCompare(b.name))
        .slice(0, 100);
      ack?.({ rooms: list });
    });

    socket.on('room:join', (p, ack) => {
      const user = socket.data.user;
      if (!user) return ack?.({ error: 'Sign in first.' });
      const room = rooms.find((r) => r.id === p?.id);
      if (!room || room.private) return ack?.({ error: 'That room does not exist.' });
      if (room.banned.includes(user.id)) return ack?.({ error: 'You cannot join this room.' });
      if (room.members.includes(user.id)) return ack?.({ room: roomView(room, user.id) });
      addMember(room, user.id);
      save();
      io.to(`user:${user.id}`).emit('room:new', roomView(room, user.id));
      // the joiner needs the existing people; the existing people need the joiner
      io.to(`user:${user.id}`).emit('history', { [room.id]: history[room.id] || [] });
      sendUsers(user.id);
      broadcastUser(user);
      emitRoom('room:update', room);
      ack?.({ room: roomView(room, user.id) });
    });

    // Everyone in a public room (private groups already carry their member list)
    socket.on('room:members', (p, ack) => {
      const user = socket.data.user;
      if (!user) return ack?.({ error: 'Sign in first.' });
      const room = rooms.find((r) => r.id === p?.id);
      if (!room || !room.members.includes(user.id)) return ack?.({ error: 'That room does not exist.' });
      const list = room.members
        .map((id) => users.get(id))
        .filter(Boolean)
        .map(publicUser)
        .sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name))
        .slice(0, MAX_PUBLIC_MEMBERS_LISTED);
      ack?.({ users: list, total: room.members.length });
    });

    socket.on('room:topic', (p, ack) => {
      const user = socket.data.user;
      if (!user) return ack?.({ error: 'Sign in first.' });
      const room = rooms.find((r) => r.id === p?.id);
      if (!room || !canAccess(user, room.id)) return ack?.({ error: 'That room does not exist.' });
      // public rooms: owner only. private groups: any member.
      if (!room.private && room.owner !== user.id) return ack?.({ error: 'Only the owner can change the topic.' });
      room.topic = String(p?.topic || '').trim().slice(0, 120);
      save();
      emitRoom('room:update', room);
      ack?.({ room: roomView(room, user.id) });
    });

    socket.on('room:create', (p, ack) => {
      const user = socket.data.user;
      if (!user) return ack?.({ error: 'Sign in first.' });
      const name = slug(p?.name);
      if (!name) return ack?.({ error: 'Use letters or numbers in the room name.' });
      if (rooms.some((r) => r.id === name || r.name === name)) return ack?.({ error: 'That room already exists.' });
      if (rooms.filter((r) => r.owner === user.id).length >= MAX_OWNED_ROOMS) {
        return ack?.({ error: `You can own up to ${MAX_OWNED_ROOMS} rooms. Delete one first.` });
      }

      const isPrivate = !!p?.private;
      // only friends can be put in a group straight away
      const invited = Array.isArray(p?.members) ? p.members : [];
      const members = isPrivate
        ? [...new Set([user.id, ...invited.filter((id) => typeof id === 'string' && areFriends(user.id, id))])].slice(0, MAX_MEMBERS)
        : [user.id];
      const icon = GROUP_ICONS.includes(p?.icon) ? p.icon : '';
      const room = {
        id: name,
        name,
        topic: String(p?.topic || '').trim().slice(0, 120) || `Started by ${user.name}`,
        icon,
        owner: user.id,
        private: isPrivate,
        members: [],
        banned: [],
        createdAt: Date.now(),
      };
      rooms.push(room);
      members.forEach((id) => addMember(room, id));
      emitRoom('room:new', room);
      for (const id of members) sendUsers(id);
      addSystem(room, `${user.name} created ${isPrivate ? 'this private group' : 'this room'}`);
      save();
      ack?.({ room: roomView(room, user.id) });
    });

    // owner: rename and change the icon
    socket.on('room:edit', (p, ack) => {
      const user = socket.data.user;
      if (!user) return ack?.({ error: 'Sign in first.' });
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
      emitRoom('room:update', room);
      if (room.name !== before) addSystem(room, `${user.name} renamed #${before} to #${room.name}`);
      ack?.({ room: roomView(room, user.id) });
    });

    socket.on('room:delete', (p, ack) => {
      const user = socket.data.user;
      if (!user) return ack?.({ error: 'Sign in first.' });
      const room = rooms.find((r) => r.id === p?.id);
      if (!room) return ack?.({ error: 'That room does not exist.' });
      if (room.owner !== user.id) return ack?.({ error: 'Only the owner can delete this.' });
      for (const id of room.members) io.to(`user:${id}`).emit('room:remove', { id: room.id });
      rooms.splice(rooms.indexOf(room), 1);
      delete history[room.id];
      io.in(`room:${room.id}`).socketsLeave(`room:${room.id}`);
      save();
      ack?.({ ok: true });
    });

    // any member of a private group can add their friends
    socket.on('room:invite', (p, ack) => {
      const user = socket.data.user;
      if (!user) return ack?.({ error: 'Sign in first.' });
      const room = rooms.find((r) => r.id === p?.id);
      if (!room || !room.private || !canAccess(user, room.id)) return ack?.({ error: 'That group does not exist.' });
      const ids = (Array.isArray(p?.ids) ? p.ids : []).filter(
        (id) => typeof id === 'string' && areFriends(user.id, id) && !room.members.includes(id)
      );
      if (!ids.length) return ack?.({ error: 'Pick a friend who is not in the group yet.' });
      if (room.members.length + ids.length > MAX_MEMBERS) return ack?.({ error: 'That group is full.' });
      ids.forEach((id) => addMember(room, id));
      save();
      for (const id of ids) {
        io.to(`user:${id}`).emit('room:new', roomView(room, id));
        io.to(`user:${id}`).emit('history', { [room.id]: history[room.id] || [] });
        sendUsers(id);
      }
      emitRoom('room:update', room);
      addSystem(room, `${user.name} added ${ids.map((id) => users.get(id).name).join(', ')}`);
      // the new members can now see each other
      for (const id of room.members) sendUsers(id);
      ack?.({ room: roomView(room, user.id) });
    });

    // owner removes someone (public rooms: they are also barred from coming back), or a member leaves
    const removeMember = (room, userId, notice, ban) => {
      dropMember(room, userId);
      if (ban && !room.private && !room.banned.includes(userId)) room.banned.push(userId);
      io.to(`user:${userId}`).emit('room:remove', { id: room.id });
      save();
      emitRoom('room:update', room);
      if (room.private && notice) addSystem(room, notice);
      sendUsers(userId);
    };

    socket.on('room:kick', (p, ack) => {
      const user = socket.data.user;
      if (!user) return ack?.({ error: 'Sign in first.' });
      const room = rooms.find((r) => r.id === p?.id);
      if (!room || room.owner !== user.id) return ack?.({ error: 'Only the owner can remove people.' });
      if (p?.userId === user.id || !room.members.includes(p?.userId)) return ack?.({ error: 'That person is not in the room.' });
      removeMember(room, p.userId, `${user.name} removed ${users.get(p.userId)?.name || 'someone'}`, true);
      ack?.({ ok: true });
    });

    socket.on('room:unban', (p, ack) => {
      const user = socket.data.user;
      if (!user) return ack?.({ error: 'Sign in first.' });
      const room = rooms.find((r) => r.id === p?.id);
      if (!room || room.private || room.owner !== user.id) return ack?.({ error: 'Only the owner can do that.' });
      room.banned = room.banned.filter((id) => id !== p?.userId);
      save();
      emitRoom('room:update', room);
      ack?.({ ok: true });
    });

    socket.on('room:leave', (p, ack) => {
      const user = socket.data.user;
      if (!user) return ack?.({ error: 'Sign in first.' });
      const room = rooms.find((r) => r.id === p?.id);
      if (!room || !room.members.includes(user.id)) return ack?.({ error: 'You are not in that room.' });
      if (room.owner === user.id) return ack?.({ error: 'Owners cannot leave. Delete the room instead.' });
      removeMember(room, user.id, `${user.name} left`, false);
      ack?.({ ok: true });
    });

    // ---- calls ----
    const callFor = (p) => {
      const user = socket.data.user;
      const call = user && typeof p?.id === 'string' ? calls.get(p.id) : null;
      return call && (call.from === user.id || call.to === user.id) ? { user, call } : null;
    };

    socket.on('call:invite', (p, ack) => {
      const user = socket.data.user;
      if (!user) return ack?.({ error: 'Sign in first.' });
      const to = users.get(typeof p?.to === 'string' ? p.to : '');
      if (!to || to.id === user.id) return ack?.({ error: 'Pick someone to call.' });
      const now = Date.now();
      if (now - (socket.data.lastInvite || 0) < 1500) return ack?.({ error: 'Slow down a little.' });
      socket.data.lastInvite = now;
      const key = dmKey(user.id, to.id);
      if (isBlocked(user.id, to.id) || !canLive(user, key)) return ack?.({ error: 'You can only call people you can message.' });
      if (callOf.has(user.id)) return ack?.({ error: 'You are already in a call.' });
      // Offline, hidden (“appear offline”) and calls-off all look the same, so a call never reveals who is around.
      const away = `${to.name} isn’t available right now.`;
      if (!connections.has(to.id) || !privacyOf(to).showOnline || !privacyOf(to).calls) return ack?.({ error: away });
      if (callOf.has(to.id)) return ack?.({ error: `${to.name} is on another call.` });

      const call = {
        id: randomUUID(), from: user.id, to: to.id, video: !!p?.video, state: 'ringing',
        fromSocket: socket.id, toSocket: null, answeredAt: 0, timer: null,
      };
      call.timer = setTimeout(() => endCall(call, 'missed'), RING_MS);
      calls.set(call.id, call);
      callOf.set(user.id, call.id);
      callOf.set(to.id, call.id);
      io.to(`user:${to.id}`).emit('call:incoming', { id: call.id, video: call.video, from: publicUser(user), ice: ICE_SERVERS });
      ack?.({ ok: true, id: call.id, ice: ICE_SERVERS });
    });

    socket.on('call:answer', (p, ack) => {
      const r = callFor(p);
      if (!r || r.call.to !== r.user.id || r.call.state !== 'ringing') return ack?.({ error: 'That call has ended.' });
      const { call, user } = r;
      clearTimeout(call.timer);
      call.state = 'active';
      call.answeredAt = Date.now();
      call.toSocket = socket.id;
      // the person's other tabs stop ringing
      socket.to(`user:${user.id}`).emit('call:ended', { id: call.id, reason: 'elsewhere' });
      io.to(call.fromSocket).emit('call:accepted', { id: call.id });
      ack?.({ ok: true });
    });

    socket.on('call:decline', (p) => {
      const r = callFor(p);
      if (r && r.call.to === r.user.id && r.call.state === 'ringing') endCall(r.call, 'declined');
    });

    // Hang up (or cancel while it is still ringing)
    socket.on('call:end', (p) => {
      const r = callFor(p);
      if (!r) return;
      if (r.call.state === 'active') endCall(r.call, 'ended');
      else if (r.call.from === r.user.id) endCall(r.call, 'cancelled');
    });

    // The WebRTC handshake, passed to the other side's tab only
    socket.on('call:signal', (p) => {
      const r = callFor(p);
      if (!r || r.call.state !== 'active') return;
      const target = socket.id === r.call.fromSocket ? r.call.toSocket : socket.id === r.call.toSocket ? r.call.fromSocket : null;
      if (!target) return;
      const data = {};
      const d = p?.data?.description;
      if (d && (d.type === 'offer' || d.type === 'answer') && typeof d.sdp === 'string' && d.sdp.length < 60_000) {
        data.description = { type: d.type, sdp: d.sdp };
      }
      const c = p?.data?.candidate;
      if (c && typeof c.candidate === 'string' && c.candidate.length < 2000) {
        data.candidate = {
          candidate: c.candidate,
          sdpMid: typeof c.sdpMid === 'string' ? c.sdpMid : null,
          sdpMLineIndex: Number.isInteger(c.sdpMLineIndex) ? c.sdpMLineIndex : null,
        };
      }
      if (data.description || data.candidate) io.to(target).emit('call:signal', { id: r.call.id, data });
    });

    // Mic and camera on/off, so the other side can show a muted badge or the avatar
    socket.on('call:media', (p) => {
      const r = callFor(p);
      if (!r || r.call.state !== 'active') return;
      const target = socket.id === r.call.fromSocket ? r.call.toSocket : socket.id === r.call.toSocket ? r.call.fromSocket : null;
      if (target) io.to(target).emit('call:media', { id: r.call.id, mic: !!p.mic, cam: !!p.cam, screen: !!p.screen });
    });

    socket.on('disconnect', () => {
      // a closed tab ends the call it was in
      for (const c of [...calls.values()]) {
        if (c.state === 'active' && (c.fromSocket === socket.id || c.toSocket === socket.id)) endCall(c, 'dropped');
        else if (c.state === 'ringing' && c.fromSocket === socket.id) endCall(c, 'cancelled');
      }
      const user = socket.data.user;
      if (!user) return;
      const left = (connections.get(user.id) || 1) - 1;
      if (left <= 0) {
        connections.delete(user.id);
        for (const c of [...calls.values()]) if (c.state === 'ringing' && c.to === user.id) endCall(c, 'missed');
        user.lastSeen = Date.now();
        save();
      } else {
        connections.set(user.id, left);
      }
      broadcastUser(user);
    });
  });

  // Write any pending changes (sessions included) when the server stops or restarts.
  const flush = () => {
    clearTimeout(saveTimer);
    persist();
  };
  httpServer.on('close', flush);
  io.flush = flush;

  return io;
}
