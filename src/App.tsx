import { useState } from 'react';
import { Replay } from './components/Replay';
import { Report } from './components/Report';
import { Setup, type SessionConfig } from './components/Setup';
import type { SavedSession } from './sessions/sessions';

type Screen = { name: 'setup' } | { name: 'replay'; config: SessionConfig } | { name: 'report'; session: SavedSession };

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'setup' });
  const toSetup = () => setScreen({ name: 'setup' });

  if (screen.name === 'replay') {
    return (
      <Replay
        key={screen.config.id}
        config={screen.config}
        onExit={toSetup}
        onEnd={(session) => setScreen({ name: 'report', session })}
      />
    );
  }
  if (screen.name === 'report') return <Report session={screen.session} onBack={toSetup} />;
  return (
    <Setup
      onStart={(config) => setScreen({ name: 'replay', config })}
      onReport={(session) => setScreen({ name: 'report', session })}
    />
  );
}
