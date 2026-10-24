import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { fmtStamp } from '../format.js';

// Full-size photo viewer. `images` is every photo in the conversation (oldest first),
// `src` is the one that was clicked. Arrow keys or the side buttons move between photos.
export default function Lightbox({ images, src, onClose }) {
  const list = useMemo(() => {
    if (images.some((x) => x.src === src)) return images;
    return [...images, { src, name: '', ts: 0 }];
  }, [images, src]);
  const [at, setAt] = useState(() => Math.max(0, list.findIndex((x) => x.src === src)));
  const [zoom, setZoom] = useState(false);
  const root = useRef(null);
  const cur = list[Math.min(at, list.length - 1)];

  const go = (step) => {
    setZoom(false);
    setAt((i) => (i + step + list.length) % list.length);
  };

  useEffect(() => root.current?.focus(), []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div
      className={zoom ? 'lightbox gallery zoomed' : 'lightbox gallery'}
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      tabIndex={-1}
      ref={root}
      onClick={onClose}
    >
      <div className="lb-top" onClick={(e) => e.stopPropagation()}>
        <span className="lb-who">
          {cur.name && <strong>{cur.name}</strong>}
          {cur.ts > 0 && <time>{fmtStamp(cur.ts)}</time>}
        </span>
        {list.length > 1 && <span className="lb-count">{Math.min(at, list.length - 1) + 1} / {list.length}</span>}
        <a className="lb-btn" href={cur.src} download="parley-photo.jpg" title="Download" aria-label="Download photo">
          <Icon name="download" size={18} />
        </a>
        <button className="lb-btn" onClick={onClose} title="Close (Esc)" aria-label="Close">
          <Icon name="close" size={18} />
        </button>
      </div>

      {list.length > 1 && (
        <button className="lb-nav prev" onClick={(e) => { e.stopPropagation(); go(-1); }} aria-label="Previous photo">
          <Icon name="back" size={24} />
        </button>
      )}

      <div className="lb-stage" onClick={(e) => e.stopPropagation()}>
        <img
          src={cur.src}
          alt="Shared photo, full size"
          draggable={false}
          onClick={() => setZoom((z) => !z)}
          title={zoom ? 'Click to fit the screen' : 'Click to zoom in'}
        />
      </div>

      {list.length > 1 && (
        <button className="lb-nav next" onClick={(e) => { e.stopPropagation(); go(1); }} aria-label="Next photo">
          <Icon name="chevron" size={24} />
        </button>
      )}
    </div>
  );
}
