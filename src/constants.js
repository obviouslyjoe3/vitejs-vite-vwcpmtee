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
];
