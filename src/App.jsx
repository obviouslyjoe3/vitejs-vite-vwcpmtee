import { useMemo, useState } from 'react';
import { useParley } from './useParley.js';
import Join from './components/Join.jsx';
import Sidebar from './components/Sidebar.jsx';
import Thread from './components/Thread.jsx';
import Logo from './components/Logo.jsx';

export default function App() {
  const p = useParley();
  const [view, setView] = useState('list'); // mobile only: 'list' | 'thread'

  const conv = useMemo(() => {
    if (!p.me || !p.active) return null;
    if (p.active.startsWith('dm:')) {
      const otherId = p.active.slice(3).split('|').find((x) => x !== p.me.id);
      const user = p.users.find((u) => u.id === otherId);
      if (!user) return null;
      return {
        id: p.active,
        kind: 'dm',
        title: user.name,
        subtitle: user.online ? 'Online now' : 'Offline. They will see this when they return.',
        user,
      };
    }
    const room = p.rooms.find((r) => r.id === p.active);
    return room ? { id: room.id, kind: 'room', title: room.name, subtitle: room.topic } : null;
  }, [p.me, p.active, p.users, p.rooms]);

  if (p.restoring) {
    return (
      <main className="splash">
        <Logo size={56} />
        <p>Reconnecting…</p>
      </main>
    );
  }

  if (!p.me) return <Join status={p.status} error={p.error} onJoin={p.join} />;

  const typers = Object.keys(p.typing[p.active] || {})
    .filter((id) => id !== p.me.id)
    .map((id) => p.users.find((u) => u.id === id)?.name)
    .filter(Boolean);

  const select = (id) => {
    p.setActive(id);
    setView('thread');
  };

  return (
    <div className="shell" data-view={view}>
      <Sidebar
        me={p.me}
        rooms={p.rooms}
        users={p.users}
        messages={p.messages}
        unread={p.unread}
        active={p.active}
        status={p.status}
        onSelect={select}
        onCreateRoom={p.createRoom}
        onLeave={p.leave}
      />
      <Thread
        conv={conv}
        me={p.me}
        messages={p.messages[p.active] || []}
        typers={typers}
        offline={p.status !== 'connected'}
        onBack={() => setView('list')}
        onSend={(text) => p.send(p.active, text)}
        onTyping={() => p.sendTyping(p.active)}
        onReact={(id, emoji) => p.react(p.active, id, emoji)}
      />
    </div>
  );
}
