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
