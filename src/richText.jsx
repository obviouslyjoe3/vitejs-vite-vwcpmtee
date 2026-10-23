// Tiny, safe formatter: **bold**, _italic_, ~~strike~~, `code`, ```code blocks```,
// "> quotes", links and @mentions. It builds React elements only (never raw HTML),
// so message text cannot inject markup.

const BASE =
  /`[^`\n]+`|\*\*[^*\n]+\*\*|~~[^~\n]+~~|(?<!\w)_[^_\n]+_(?!\w)|https?:\/\/[^\s<]+[^\s<.,;:!?)"']/.source;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function mentionSource(users) {
  const names = users.map((u) => u.name).filter(Boolean).sort((a, b) => b.length - a.length);
  return names.length ? '@(?:' + names.map(escapeRe).join('|') + ')(?![\\w])' : '';
}

function inline(text, re, meTag, keyBase) {
  return text.split(re).map((part, i) => {
    if (i % 2 === 0) return part;
    const key = `${keyBase}-${i}`;
    if (part.startsWith('`')) return <code key={key}>{part.slice(1, -1)}</code>;
    if (part.startsWith('**')) return <strong key={key}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('~~')) return <s key={key}>{part.slice(2, -2)}</s>;
    if (part.startsWith('_')) return <em key={key}>{part.slice(1, -1)}</em>;
    if (part.startsWith('@')) {
      return (
        <span key={key} className={part.toLowerCase() === meTag ? 'mention me' : 'mention'}>
          {part}
        </span>
      );
    }
    return (
      <a key={key} href={part} target="_blank" rel="noopener noreferrer">
        {part}
      </a>
    );
  });
}

export function renderRich(text, mentionSrc, meName) {
  const re = new RegExp('(' + BASE + (mentionSrc ? '|' + mentionSrc : '') + ')', 'gi');
  const meTag = ('@' + meName).toLowerCase();

  return text.split(/```([\s\S]*?)```/).map((block, bi) => {
    if (bi % 2 === 1) {
      return (
        <pre key={bi}>
          <code>{block.replace(/^\n/, '').replace(/\n$/, '')}</code>
        </pre>
      );
    }
    // group consecutive "> " lines into a quote
    const out = [];
    let plain = [];
    let quote = [];
    const flushPlain = () => {
      if (plain.length) out.push(<span key={`p${out.length}`}>{inline(plain.join('\n'), re, meTag, `${bi}p${out.length}`)}</span>);
      plain = [];
    };
    const flushQuote = () => {
      if (quote.length) out.push(<blockquote key={`q${out.length}`}>{inline(quote.join('\n'), re, meTag, `${bi}q${out.length}`)}</blockquote>);
      quote = [];
    };
    for (const line of block.split('\n')) {
      if (/^>\s?/.test(line)) {
        flushPlain();
        quote.push(line.replace(/^>\s?/, ''));
      } else {
        flushQuote();
        plain.push(line);
      }
    }
    flushPlain();
    flushQuote();
    return <span key={bi}>{out}</span>;
  });
}

// Plain-text version for previews and search snippets.
export const stripMarks = (t = '') =>
  t.replace(/```/g, '').replace(/\*\*|~~|`/g, '').replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, '$1');

// Splits text around a search term so the match can be highlighted.
export function highlight(text, term) {
  if (!term) return text;
  const parts = text.split(new RegExp('(' + escapeRe(term) + ')', 'gi'));
  return parts.map((p, i) =>
    i % 2 === 1 ? <mark key={i}>{p}</mark> : p
  );
}
