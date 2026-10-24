import { EMOJI_ART } from './emojiArt.js';

// Parley's drawn emoji. Falls back to the system glyph for anything not in the set.
const norm = (c) => c.replace(/\uFE0F/g, '');
const ART = Object.fromEntries(Object.entries(EMOJI_ART).map(([k, v]) => [norm(k), v]));

export const hasArt = (c) => !!ART[norm(c)];

export default function Emoji({ char, size, title }) {
  const art = document.documentElement.dataset.emoji === 'system' ? null : ART[norm(char || '')];
  if (!art) return <span className="emoji-native">{char}</span>;
  const style = size ? { width: size, height: size } : undefined;
  return (
    <svg
      className="emoji"
      style={style}
      viewBox="0 0 32 32"
      role="img"
      aria-label={title || char}
      // static, trusted artwork from emojiArt.js (never user input)
      dangerouslySetInnerHTML={{ __html: art }}
    />
  );
}

// Splits text so every emoji we have drawn becomes an <Emoji>, everything else stays text.
const keys = Object.keys(ART).sort((a, b) => b.length - a.length);
const EMOJI_RE = new RegExp('(' + keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\uFE0F?').join('|') + ')', 'g');

export function withEmoji(text, keyBase = 'e') {
  if (document.documentElement.dataset.emoji === 'system') return text;
  if (!text || !EMOJI_RE.test(text)) {
    EMOJI_RE.lastIndex = 0;
    return text;
  }
  EMOJI_RE.lastIndex = 0;
  return text.split(EMOJI_RE).map((part, i) => (i % 2 === 1 ? <Emoji key={`${keyBase}-${i}`} char={part} /> : part));
}
