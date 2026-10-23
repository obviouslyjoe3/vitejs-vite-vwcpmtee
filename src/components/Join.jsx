import { useState } from 'react';
import Logo from './Logo.jsx';

export default function Join({ status, error, onJoin }) {
  const [name, setName] = useState('');
  const offline = status === 'offline';

  const submit = (e) => {
    e.preventDefault();
    if (name.trim() && !offline) onJoin(name.trim());
  };

  return (
    <main className="join">
      <div className="join-card">
        <Logo size={64} />
        <h1>parley</h1>
        <p className="join-sub">
          Chat with anyone who has this page open, in rooms or one to one. Pick a name to start.
        </p>

        <form onSubmit={submit}>
          <label htmlFor="name">Your name</label>
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={24}
            autoFocus
            autoComplete="off"
            placeholder="Ada"
          />
          {error && <p className="form-error">{error}</p>}
          {offline && (
            <p className="form-error">Can’t reach the chat server. Retrying automatically…</p>
          )}
          <button type="submit" disabled={!name.trim() || offline}>
            {status === 'connecting' ? 'Connecting…' : 'Start chatting'}
          </button>
        </form>
      </div>
    </main>
  );
}
