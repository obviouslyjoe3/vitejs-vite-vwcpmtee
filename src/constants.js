// Keep COLORS in sync with server/chatServer.js
export const COLORS = ['#5B3FD9', '#0F8F73', '#C2347A', '#B8620F', '#2A6FBF', '#7A8A12', '#A33BC4'];

// Keep REACTIONS in sync with server/chatServer.js
export const REACTIONS = [
  '👍', '❤️', '😂', '🎉', '👀', '🙏', '🔥', '😮', '😢', '🤔',
  '💯', '✅', '👏', '🚀', '💜', '😍', '🥳', '😅', '👎', '🙌',
];
export const QUICK_REACTIONS = REACTIONS.slice(0, 6);

export const EMOJI = [
  '😀', '😂', '🥹', '😍', '😎', '🤔', '😅', '😭', '🙌', '👍',
  '👏', '🙏', '🔥', '✨', '🎉', '❤️', '💜', '👀', '💯', '✅',
  '❌', '🚀', '☕', '🍕', '🌈', '🐶', '🐱', '🤯', '😴', '🥳',
  '😮', '😢', '🤝', '💡', '📌', '🎧', '🌙', '🍿', '🏆', '🫶',
];

export const STATUS_PRESETS = [
  { emoji: '💻', text: 'Heads down' },
  { emoji: '🍽', text: 'Out for lunch' },
  { emoji: '🎧', text: 'In a call' },
  { emoji: '🌴', text: 'Away' },
];

export const ACCENTS = [
  ['violet', 'Violet', '#5B3FD9'],
  ['teal', 'Teal', '#0F8F73'],
  ['rose', 'Rose', '#C2347A'],
  ['amber', 'Amber', '#B8620F'],
  ['blue', 'Blue', '#2A6FBF'],
  ['green', 'Green', '#3f7d20'],
  ['graphite', 'Graphite', '#4b5563'],
];

// :shortcode: -> emoji (typed with autocomplete, converted when you send)
export const SHORTCODES = {
  smile: '😀', grin: '😁', joy: '😂', laugh: '🤣', wink: '😉', heart_eyes: '😍', cool: '😎',
  think: '🤔', cry: '😭', sob: '😭', sweat: '😅', shock: '😮', scream: '😱', sleepy: '😴', party: '🥳',
  mindblown: '🤯', eyes: '👀', thumbsup: '👍', thumbsdown: '👎', clap: '👏', pray: '🙏', wave: '👋',
  muscle: '💪', ok: '👌', handshake: '🤝', raised_hands: '🙌', heart: '❤️', purple_heart: '💜',
  fire: '🔥', sparkles: '✨', star: '⭐', tada: '🎉', rocket: '🚀', hundred: '💯', check: '✅', x: '❌',
  warning: '⚠️', bulb: '💡', pin: '📌', trophy: '🏆', coffee: '☕', pizza: '🍕', beer: '🍺', cake: '🎂',
  dog: '🐶', cat: '🐱', rainbow: '🌈', sun: '☀️', moon: '🌙', snowflake: '❄️', music: '🎵', headphones: '🎧',
  gift: '🎁', bug: '🐛', skull: '💀', ghost: '👻', robot: '🤖', poop: '💩', zzz: '💤', hourglass: '⌛',
};
export const replaceShortcodes = (text) =>
  text.replace(/:([a-z0-9_]{1,20}):/g, (m, k) => SHORTCODES[k] || m);

// Icons a group can use (empty string means the default #). Keep in sync with GROUP_ICONS in server/chatServer.js
export const GROUP_ICONS = ['', '💬', '💡', '🎮', '🎵', '📚', '🍕', '🌱', '🚀', '🎨', '⚽', '✈️', '🐶', '☕'];

// The shared public room is silent: no unread badge, sounds or desktop alerts (an @mention still gets through).
export const QUIET_ROOMS = ['lobby', 'global'];

// Profile banners (id -> CSS gradient). Keep the ids in sync with BANNERS in server/chatServer.js
export const BANNERS = [
  ['violet', 'Violet', 'linear-gradient(135deg, #5b3fd9, #a06bff)'],
  ['sunset', 'Sunset', 'linear-gradient(135deg, #ff7a59, #c2347a)'],
  ['ocean', 'Ocean', 'linear-gradient(135deg, #1f6fd0, #28c2c9)'],
  ['forest', 'Forest', 'linear-gradient(135deg, #0f8f73, #9bcf4a)'],
  ['candy', 'Candy', 'linear-gradient(135deg, #ff8fb1, #8f7bff)'],
  ['slate', 'Slate', 'linear-gradient(135deg, #3b4252, #7b8798)'],
  ['aurora', 'Aurora', 'linear-gradient(135deg, #0f8f73, #5b3fd9 55%, #c2347a)'],
  ['dusk', 'Dusk', 'linear-gradient(135deg, #17133a, #5b3fd9 60%, #f2b134)'],
];
export const bannerCss = (user) => {
  const hit = BANNERS.find(([id]) => id === user?.banner);
  if (hit) return hit[2];
  // no banner chosen: a soft gradient from the person's own color
  const c = user?.color || '#5B3FD9';
  return `linear-gradient(135deg, ${c}, color-mix(in srgb, ${c} 45%, #ffffff))`;
};

export const INTEREST_IDEAS = ['Gaming', 'Music', 'Reading', 'Cooking', 'Hiking', 'Coding', 'Film', 'Art', 'Travel', 'Fitness'];

// Who may start a conversation with you (keep in sync with DM_POLICIES on the server)
export const DM_POLICIES = [
  ['everyone', 'Everyone', 'Anyone can send you a message request. Friends message you directly.'],
  ['shared', 'Friends and people you know', 'Friends, friends of friends, and people who share a group with you. Everyone else is blocked from asking.'],
  ['friends', 'Friends only', 'Only friends can message you. Nobody else can start a conversation.'],
];
export const MAX_REQUEST_MSGS = 3;
