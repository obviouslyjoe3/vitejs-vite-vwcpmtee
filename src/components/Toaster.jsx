import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';

export default function Toaster() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const onToast = (e) => {
      const t = e.detail;
      setItems((cur) => [...cur.slice(-3), t]);
      setTimeout(() => setItems((cur) => cur.filter((x) => x.id !== t.id)), t.kind === 'error' ? 5000 : 3200);
    };
    window.addEventListener('parley:toast', onToast);
    return () => window.removeEventListener('parley:toast', onToast);
  }, []);

  return (
    <div className="toaster" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <Icon name={t.kind === 'error' ? 'ban' : t.kind === 'success' ? 'check' : 'info'} size={16} />
          <span>{t.text}</span>
          <button className="toast-x" aria-label="Dismiss" onClick={() => setItems((cur) => cur.filter((x) => x.id !== t.id))}>
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
