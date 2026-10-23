import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';

export function PollView({ poll, meId, onVote, disabled }) {
  const total = new Set(poll.options.flatMap((o) => o.votes)).size;
  return (
    <div className="poll">
      <p className="poll-q">{poll.question}</p>
      <ul>
        {poll.options.map((o) => {
          const mine = o.votes.includes(meId);
          const pct = total ? Math.round((o.votes.length / total) * 100) : 0;
          return (
            <li key={o.id}>
              <button
                className={mine ? 'poll-opt on' : 'poll-opt'}
                disabled={disabled}
                onClick={() => onVote(o.id)}
                aria-pressed={mine}
              >
                <span className="poll-fill" style={{ width: pct + '%' }} />
                <span className="poll-check">{mine && <Icon name="check" size={14} />}</span>
                <span className="poll-text">{o.text}</span>
                <span className="poll-count">{o.votes.length}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="poll-foot">
        {total} {total === 1 ? 'vote' : 'votes'} · {poll.multi ? 'Choose any' : 'Choose one'}
      </p>
    </div>
  );
}

export function PollDialog({ onCreate, onClose }) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [multi, setMulti] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filled = options.map((o) => o.trim()).filter(Boolean);
  const ok = question.trim() && filled.length >= 2;

  const submit = (e) => {
    e.preventDefault();
    if (ok) onCreate({ question: question.trim(), options: filled, multi });
  };

  return (
    <div className="overlay" onMouseDown={onClose}>
      <form
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="poll-title"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <header>
          <h2 id="poll-title">New poll</h2>
          <button type="button" className="text-btn" onClick={onClose}>
            Cancel
          </button>
        </header>
        <section>
          <label className="field-label" htmlFor="poll-q">Question</label>
          <input
            id="poll-q"
            className="field"
            value={question}
            maxLength={140}
            autoFocus
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Where should we eat?"
          />
        </section>
        <section>
          <span className="field-label">Options</span>
          <div className="poll-inputs">
            {options.map((o, i) => (
              <div key={i} className="poll-input-row">
                <input
                  className="field"
                  value={o}
                  maxLength={80}
                  aria-label={`Option ${i + 1}`}
                  placeholder={`Option ${i + 1}`}
                  onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))}
                />
                {options.length > 2 && (
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Remove option ${i + 1}`}
                    onClick={() => setOptions(options.filter((_, j) => j !== i))}
                  >
                    <Icon name="close" size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {options.length < 6 && (
            <button type="button" className="text-btn add-option" onClick={() => setOptions([...options, ''])}>
              <Icon name="plus" size={14} /> Add option
            </button>
          )}
        </section>
        <label className="check">
          <input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} />
          Let people choose more than one
        </label>
        <button className="primary wide" type="submit" disabled={!ok}>
          Post poll
        </button>
      </form>
    </div>
  );
}
