import { useEffect } from 'react';
import Icon from './Icon.jsx';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '');
const MOD = isMac ? '⌘' : 'Ctrl';

const GROUPS = [
  {
    title: 'Get around',
    rows: [
      [[MOD, 'K'], 'Jump to a room, person or message'],
      [['Alt', '↑'], 'Previous conversation'],
      [['Alt', '↓'], 'Next conversation'],
      [['Esc'], 'Close a panel, menu or dialog'],
      [['?'], 'Show this list'],
    ],
  },
  {
    title: 'Writing',
    rows: [
      [['Enter'], 'Send (Shift+Enter for a new line)'],
      [['↑'], 'Edit your last message (in an empty box)'],
      [[MOD, 'B'], 'Bold'],
      [[MOD, 'I'], 'Italic'],
      [[':', 'name'], 'Emoji suggestions'],
      [['@'], 'Mention someone'],
    ],
  },
  {
    title: 'Photos',
    rows: [
      [['Drop'], 'Drag a photo onto the chat to attach it'],
      [['←', '→'], 'Move between photos in the viewer'],
      [['Click'], 'Zoom a photo in the viewer'],
    ],
  },
];

export default function ShortcutsDialog({ onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="dialog keys-dialog" role="dialog" aria-modal="true" aria-labelledby="keys-title" onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <h2 id="keys-title"><Icon name="keyboard" size={22} /> Keyboard shortcuts</h2>
          <button className="text-btn" onClick={onClose}>Close</button>
        </header>
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h3>{g.title}</h3>
            <dl className="keymap">
              {g.rows.map(([keys, what]) => (
                <div key={what}>
                  <dt>
                    {keys.map((k, i) => (
                      <span key={i}>
                        {i > 0 && <i>+</i>}
                        <kbd>{k}</kbd>
                      </span>
                    ))}
                  </dt>
                  <dd>{what}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  );
}
