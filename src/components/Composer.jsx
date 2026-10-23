import { useRef, useState } from 'react';

export default function Composer({ placeholder, disabled, onSend, onTyping }) {
  const [text, setText] = useState('');
  const box = useRef(null);
  const lastTyping = useRef(0);

  const grow = () => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 150) + 'px';
  };

  const send = () => {
    const value = text.trim();
    if (!value || disabled) return;
    onSend(value);
    setText('');
    requestAnimationFrame(grow);
  };

  const change = (e) => {
    setText(e.target.value);
    grow();
    const now = Date.now();
    if (now - lastTyping.current > 1500) {
      lastTyping.current = now;
      onTyping();
    }
  };

  return (
    <div className="composer">
      <textarea
        ref={box}
        value={text}
        rows={1}
        onChange={change}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
        placeholder={disabled ? 'Reconnecting…' : placeholder}
        aria-label={placeholder}
        disabled={disabled}
      />
      <button onClick={send} disabled={disabled || !text.trim()}>
        Send
      </button>
    </div>
  );
}
