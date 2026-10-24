import { useEffect, useState } from 'react';

const COLORS = ['#5B3FD9', '#17b38a', '#f2b134', '#cf3a5d', '#2A6FBF', '#c2347a'];

export default function Confetti() {
  const [burst, setBurst] = useState(null);

  useEffect(() => {
    const go = () => {
      const reduce =
        document.documentElement.dataset.motion === 'reduced' ||
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (reduce) return;
      const id = Math.random();
      const pieces = Array.from({ length: 46 }, (_, i) => ({
        i,
        left: 10 + Math.random() * 80,
        delay: Math.random() * 0.25,
        dur: 1.6 + Math.random() * 1.2,
        drift: (Math.random() - 0.5) * 220,
        spin: 360 + Math.random() * 720,
        color: COLORS[i % COLORS.length],
        w: 6 + Math.random() * 6,
      }));
      setBurst({ id, pieces });
      setTimeout(() => setBurst((b) => (b && b.id === id ? null : b)), 3200);
    };
    window.addEventListener('parley:confetti', go);
    return () => window.removeEventListener('parley:confetti', go);
  }, []);

  if (!burst) return null;
  return (
    <div className="confetti" aria-hidden="true">
      {burst.pieces.map((p) => (
        <i
          key={p.i}
          style={{
            left: `${p.left}%`, width: p.w, height: p.w * 1.6, background: p.color,
            animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`,
            '--drift': `${p.drift}px`, '--spin': `${p.spin}deg`,
          }}
        />
      ))}
    </div>
  );
}
