import { useState } from 'react';
import { Replay } from './components/Replay';
import { Setup, type SessionConfig } from './components/Setup';

export function App() {
  const [config, setConfig] = useState<SessionConfig | null>(null);
  return config ? <Replay config={config} onExit={() => setConfig(null)} /> : <Setup onStart={setConfig} />;
}
