import { useState } from 'react';
import Logo from './Logo.jsx';

export default function Auth({ status, error, onLogin, onRegister }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const offline = status === 'offline';
  const registering = mode === 'register';

  const switchTo = (next) => {
    setMode(next);
    setProblem('');
    setPassword('');
    setAgain('');
  };

  const submit = async (e) => {
    e.preventDefault();
    if (busy || offline) return;
    const name = username.trim();
    if (registering) {
      if (password.length < 8) return setProblem('Use at least 8 characters for your password.');
      if (password !== again) return setProblem('The two passwords do not match.');
    }
    setBusy(true);
    setProblem('');
    const res = await (registering ? onRegister(name, password) : onLogin(name, password));
    setBusy(false);
    if (res?.error) setProblem(res.error);
  };

  const shown = problem || error;

  return (
    <main className="join">
      <div className="join-side">
        <div className="join-card">
          <Logo size={64} />
          <h1>parley</h1>
          <p className="join-sub">
            {registering
              ? 'Make an account to chat in public rooms and with your friends.'
              : 'Sign in to pick up your rooms, friends and conversations.'}
          </p>

          <div className="segmented auth-tabs" role="tablist" aria-label="Sign in or create an account">
            <button type="button" role="tab" aria-selected={!registering} className={!registering ? 'on' : ''} onClick={() => switchTo('login')}>
              Sign in
            </button>
            <button type="button" role="tab" aria-selected={registering} className={registering ? 'on' : ''} onClick={() => switchTo('register')}>
              Create account
            </button>
          </div>

          <form onSubmit={submit}>
            <label htmlFor="username">Username</label>
            <input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={20}
              autoFocus
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="ada_l"
            />
            {registering && <p className="hint">3 to 20 letters, numbers or _. Friends find you by this, and it can’t be changed later.</p>}

            <label htmlFor="password" className="spaced">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              maxLength={128}
              autoComplete={registering ? 'new-password' : 'current-password'}
              placeholder={registering ? 'At least 8 characters' : 'Your password'}
            />

            {registering && (
              <>
                <label htmlFor="again" className="spaced">Repeat password</label>
                <input
                  id="again"
                  type="password"
                  value={again}
                  onChange={(e) => setAgain(e.target.value)}
                  maxLength={128}
                  autoComplete="new-password"
                />
              </>
            )}

            {shown && <p className="form-error" role="alert">{shown}</p>}
            {offline && <p className="form-error">Can’t reach the chat server. Retrying automatically…</p>}
            <button type="submit" disabled={!username.trim() || !password || offline || busy}>
              {status === 'connecting' ? 'Connecting…' : busy ? 'One moment…' : registering ? 'Create account' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>

      <aside className="join-stage" aria-hidden="true">
        <div className="preview-win">
          <div className="preview-head">
            <span>#</span> design-crit <small>4 online</small>
          </div>
          <div className="preview-body">
            <div className="pv">
              <i style={{ background: '#0F8F73' }}>M</i>
              <p>Pushed the new sidebar. Thoughts?</p>
            </div>
            <div className="pv">
              <i style={{ background: '#C2347A' }}>R</i>
              <p>Much calmer. The unread badges read well now.</p>
            </div>
            <div className="pv-react">🔥 3</div>
            <div className="pv mine">
              <p>Shipping it after lunch 🚀</p>
            </div>
          </div>
        </div>
      </aside>
    </main>
  );
}
