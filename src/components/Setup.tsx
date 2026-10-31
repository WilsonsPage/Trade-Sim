import { useEffect, useState } from 'react';
import { demoDataset, loadIndex, parseCsv, type DatasetInfo } from '../data/load';
import { symbolName, symbolSpec } from '../data/symbols';
import { TIMEFRAMES } from '../data/timeframes';
import {
  deleteSession,
  listSessions,
  loadSessionData,
  loadSource,
  storeImported,
  type DatasetSource,
  type SavedSession,
} from '../sessions/sessions';
import type { ChallengeRules, TradingState } from '../trading/engine';
import type { Dataset } from '../types';

export interface SessionConfig {
  id: string;
  createdAt: number;
  dataset: Dataset;
  source: DatasetSource;
  tfSeconds: number;
  /** An optional second chart that follows the main chart's replay time. */
  second?: SecondChart;
  startTime: number;
  startBalance: number;
  /** Spread in pips and round-turn commission in USD per lot. */
  spreadPips: number;
  commission: number;
  /** Prop firm style rules, if this session is a challenge. */
  challenge?: ChallengeRules;
  /** Set when resuming a saved session. */
  initialPos?: number;
  initialTrading?: TradingState;
}

export interface SecondChart {
  dataset: Dataset;
  source: DatasetSource;
  tfSeconds: number;
}

/** Common prop firm challenge shapes (limits as fractions of the starting balance). */
const CHALLENGES: ChallengeRules[] = [
  { name: '2-step, phase 1', profitTarget: 0.08, dailyLoss: 0.05, maxLoss: 0.1, minTradingDays: 4 },
  { name: '2-step, phase 2', profitTarget: 0.05, dailyLoss: 0.05, maxLoss: 0.1, minTradingDays: 4 },
  { name: '1-step', profitTarget: 0.1, dailyLoss: 0.03, maxLoss: 0.06, minTradingDays: 3 },
];

const tfLabel = (s: number) => TIMEFRAMES.find((tf) => tf.seconds === s)?.label ?? `${s}s`;
const fmtMoney = (n: number) => `${n < 0 ? '-' : '+'}$${Math.abs(n).toFixed(2)}`;

/** A market picked in the wizard. Downloaded data is only fetched once the sim starts. */
interface Pick {
  symbol: string;
  baseSeconds: number;
  from: number;
  to: number;
  source: DatasetSource;
  /** Already in memory (demo data and imported CSVs). */
  dataset?: Dataset;
}

const pickOf = (info: DatasetInfo): Pick => ({ symbol: info.symbol, baseSeconds: 60, from: info.from, to: info.to, source: { kind: 'download', info } });
const pickOfDataset = (d: Dataset, source: DatasetSource): Pick => ({
  symbol: d.symbol,
  baseSeconds: d.baseSeconds,
  from: d.bars[0].time,
  to: d.bars[d.bars.length - 1].time,
  source,
  dataset: d,
});

const toDateInput = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
const fromDateInput = (s: string) => Date.parse(`${s}T00:00:00Z`) / 1000;

interface Props {
  onStart: (c: SessionConfig) => void;
  onReport: (s: SavedSession) => void;
}

type Step = 'mode' | 'challenge' | 'split' | 'markets' | 'account';

const STEP_TITLES: Record<Step, string> = {
  mode: 'Challenge',
  challenge: 'Rules',
  split: 'Charts',
  markets: 'Markets',
  account: 'Account',
};

/** Account sizes prop firms usually offer. */
const BALANCES = [5000, 10000, 25000, 50000, 100000, 200000];

const pct = (n: number) => `${+(n * 100).toFixed(2)}%`;

function ChoiceCard({
  icon,
  title,
  detail,
  active,
  onClick,
}: {
  icon: string;
  title: string;
  detail: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button className={active ? 'choice-card active' : 'choice-card'} onClick={onClick} aria-pressed={!!active}>
      <span className="choice-icon" aria-hidden>
        {icon}
      </span>
      <strong>{title}</strong>
      <span className="muted small">{detail}</span>
    </button>
  );
}

export function Setup({ onStart, onReport }: Props) {
  const [index, setIndex] = useState<DatasetInfo[] | null>(null);
  const [main, setMain] = useState<Pick | null>(null);
  const [sessions, setSessions] = useState<SavedSession[]>([]);
  const [tfSeconds, setTfSeconds] = useState(900);
  const [start, setStart] = useState('');
  const [balance, setBalance] = useState('10000');
  const [spread, setSpread] = useState('0');
  const [commission, setCommission] = useState('0');
  const [status, setStatus] = useState('');
  const [second, setSecond] = useState<{ pick: Pick; tfSeconds: number } | null>(null);
  const [challenge, setChallenge] = useState<ChallengeRules | null>(null);
  // Wizard answers. null means "not answered yet".
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('mode');
  const [isChallenge, setIsChallenge] = useState<boolean | null>(null);
  const [split, setSplit] = useState<boolean | null>(null);

  useEffect(() => {
    loadIndex().then(setIndex);
    listSessions().then(setSessions).catch(() => setSessions([]));
  }, []);

  // Split screen needs at least two downloaded markets.
  const canSplit = !!index && index.length > 1;
  const steps: Step[] = ['mode', ...(isChallenge ? ['challenge' as const] : []), ...(canSplit ? ['split' as const] : []), 'markets', 'account'];
  const stepNo = steps.indexOf(step);

  const go = (next: Step) => {
    setStatus('');
    setStep(next);
  };
  const back = () => (stepNo > 0 ? go(steps[stepNo - 1]) : setOpen(false));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const openWizard = () => {
    setStep('mode');
    setStatus('');
    setOpen(true);
  };

  const resume = async (s: SavedSession) => {
    setStatus(`Loading ${s.symbol}…`);
    try {
      const data = await loadSessionData(s);
      onStart({
        id: s.id,
        createdAt: s.createdAt,
        dataset: data.dataset,
        source: s.source,
        tfSeconds: s.tfSeconds,
        second: s.second && data.second && { dataset: data.second, source: s.second.source, tfSeconds: s.second.tfSeconds },
        startTime: s.startTime,
        startBalance: s.startBalance,
        spreadPips: 0,
        commission: 0,
        initialPos: data.pos,
        initialTrading: s.trading,
      });
    } catch (e) {
      setStatus((e as Error).message);
    }
  };

  const remove = async (s: SavedSession) => {
    if (!confirm(`Delete this ${s.symbol} session?`)) return;
    await deleteSession(s.id);
    setSessions(await listSessions());
  };

  const choose = (p: Pick) => {
    setMain(p);
    if (second?.pick.symbol === p.symbol) setSecond(null);
    setSpread(String(symbolSpec(p.symbol).spreadPips));
    if (!TIMEFRAMES.some((tf) => tf.seconds === tfSeconds && tf.seconds >= p.baseSeconds)) {
      setTfSeconds(TIMEFRAMES.find((tf) => tf.seconds >= p.baseSeconds)?.seconds ?? p.baseSeconds);
    }
    // Default to a year before the end (or a third of the way into shorter data), so there
    // is history on the chart and plenty left to replay.
    setStart(toDateInput(Math.max(p.from + (p.to - p.from) / 3, p.to - 365 * 86400)));
    setStatus('');
  };

  const pickSecond = (info: DatasetInfo | null) => setSecond(info && { pick: pickOf(info), tfSeconds });

  const importFile = async (file: File) => {
    try {
      const symbol = file.name.match(/^[A-Za-z]{6}/)?.[0].toUpperCase() ?? file.name.replace(/\.\w+$/, '');
      const d = parseCsv(await file.text(), symbol);
      choose(pickOfDataset(d, await storeImported(d).catch((): DatasetSource => ({ kind: 'import', key: '' }))));
    } catch (e) {
      setStatus(`Import failed: ${(e as Error).message}`);
    }
  };

  // With two charts, the start date must fall where both have data.
  const ranges = [main, split ? second?.pick : undefined].filter((p): p is Pick => !!p);
  const first = ranges.length ? Math.max(...ranges.map((p) => p.from)) : undefined;
  const last = ranges.length ? Math.min(...ranges.map((p) => p.to)) : undefined;
  const overlap = first !== undefined && last !== undefined && first <= last;
  const label = (symbol: string) => (symbolName(symbol) ? `${symbol} · ${symbolName(symbol)}` : symbol);

  const challengeValid = !!challenge && challenge.profitTarget > 0 && challenge.dailyLoss > 0 && challenge.maxLoss > 0;
  const ready: Record<Step, boolean> = {
    mode: isChallenge !== null,
    challenge: challengeValid,
    split: split !== null,
    markets: !!main && (!split || !!second) && overlap,
    account: !!start && Number(balance) > 0,
  };

  const [loading, setLoading] = useState(false);
  const begin = async () => {
    if (!main) return;
    const startTime = Math.max(fromDateInput(start), first!);
    const load = (p: Pick) => p.dataset ?? loadSource(p.source, startTime);
    const two = split && second ? second : null;
    setLoading(true);
    setStatus(`Loading ${[main.symbol, two?.pick.symbol].filter(Boolean).join(' and ')}…`);
    try {
      const [dataset, dataset2] = await Promise.all([load(main), two && load(two.pick)]);
      onStart({
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        dataset,
        source: main.source,
        tfSeconds,
        second: (two && dataset2 && { dataset: dataset2, source: two.pick.source, tfSeconds: two.tfSeconds }) || undefined,
        startTime,
        startBalance: Number(balance),
        spreadPips: Math.max(0, Number(spread) || 0),
        commission: Math.max(0, Number(commission) || 0),
        challenge: (isChallenge && challenge) || undefined,
      });
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const twoStep = challenge?.name.startsWith('2-step') ?? false;
  const summary = [
    main && `${main.symbol} ${tfLabel(tfSeconds)}`,
    split && second && `${second.pick.symbol} ${tfLabel(second.tfSeconds)}`,
  ]
    .filter(Boolean)
    .join(' + ');

  const body = () => {
    switch (step) {
      case 'mode':
        return (
          <>
            <h2>Are you doing a challenge?</h2>
            <div className="choice-grid">
              <ChoiceCard
                icon="🏆"
                title="Prop firm challenge"
                detail="Hit a profit target without breaking daily or max loss limits."
                active={isChallenge === true}
                onClick={() => {
                  setIsChallenge(true);
                  if (!challenge) setChallenge(CHALLENGES[0]);
                  go('challenge');
                }}
              />
              <ChoiceCard
                icon="📈"
                title="Free practice"
                detail="No rules. Just replay the market and trade."
                active={isChallenge === false}
                onClick={() => {
                  setIsChallenge(false);
                  go(canSplit ? 'split' : 'markets');
                }}
              />
            </div>
          </>
        );
      case 'challenge':
        return (
          <>
            <h2>1-step or 2-step?</h2>
            <div className="choice-grid">
              <ChoiceCard
                icon="1️⃣"
                title="1-step"
                detail={`One phase: ${pct(CHALLENGES[2].profitTarget)} target, ${pct(CHALLENGES[2].maxLoss)} max loss.`}
                active={challenge?.name === '1-step'}
                onClick={() => setChallenge(CHALLENGES[2])}
              />
              <ChoiceCard
                icon="2️⃣"
                title="2-step"
                detail={`Phase 1 then phase 2, ${pct(CHALLENGES[0].maxLoss)} max loss.`}
                active={twoStep}
                onClick={() => !twoStep && setChallenge(CHALLENGES[0])}
              />
              <ChoiceCard
                icon="⚙️"
                title="Custom"
                detail="Set your own target and limits."
                active={challenge?.name === 'Custom'}
                onClick={() => setChallenge({ ...(challenge ?? CHALLENGES[0]), name: 'Custom' })}
              />
            </div>
            {twoStep && (
              <div className="chips phase-pick">
                {CHALLENGES.slice(0, 2).map((c) => (
                  <button key={c.name} className={challenge?.name === c.name ? 'chip active' : 'chip'} onClick={() => setChallenge(c)}>
                    {c.name.replace('2-step, p', 'P')}
                  </button>
                ))}
              </div>
            )}
            {challenge && (
              <>
                <p className="muted small">
                  Limits use equity (including open trades) and the daily limit resets at 00:00 UTC. Edit any number to
                  make it custom.
                </p>
                <div className="row account-setup challenge-rules">
                  {(
                    [
                      ['Profit target %', 'profitTarget'],
                      ['Daily loss limit %', 'dailyLoss'],
                      ['Max loss limit %', 'maxLoss'],
                    ] as const
                  ).map(([label, key]) => (
                    <label key={key} className="field">
                      {label}
                      <input
                        type="number"
                        min="0.5"
                        step="0.5"
                        value={+(challenge[key] * 100).toFixed(2)}
                        onChange={(e) => setChallenge({ ...challenge, name: 'Custom', [key]: Math.max(0, Number(e.target.value)) / 100 })}
                      />
                    </label>
                  ))}
                  <label className="field">
                    Min trading days
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={challenge.minTradingDays}
                      onChange={(e) => setChallenge({ ...challenge, name: 'Custom', minTradingDays: Math.max(0, Math.round(Number(e.target.value))) })}
                    />
                  </label>
                </div>
              </>
            )}
          </>
        );
      case 'split':
        return (
          <>
            <h2>One chart or split screen?</h2>
            <div className="choice-grid">
              <ChoiceCard
                icon="▭"
                title="One chart"
                detail="Trade a single market."
                active={split === false}
                onClick={() => {
                  setSplit(false);
                  go('markets');
                }}
              />
              <ChoiceCard
                icon="◫"
                title="Split screen"
                detail="Two markets side by side, replaying on the same date."
                active={split === true}
                onClick={() => {
                  setSplit(true);
                  go('markets');
                }}
              />
            </div>
          </>
        );
      case 'markets':
        return (
          <>
            <h2>{split ? 'Main chart (the one you trade)' : 'Pick a market'}</h2>
            {index === null && <p className="muted">Looking for downloaded data…</p>}
            {index?.length === 0 && (
              <p className="muted">
                No market data found. Try the demo data or import a CSV below. (Running locally? Use{' '}
                <code>npm run fetch-data</code> to download market data.)
              </p>
            )}
            <div className="chips main-pick">
              {index?.map((info) => (
                <button
                  key={info.symbol}
                  className={main?.symbol === info.symbol ? 'chip active' : 'chip'}
                  onClick={() => choose(pickOf(info))}
                  title={`${toDateInput(info.from)} → ${toDateInput(info.to)}`}
                >
                  {label(info.symbol)}
                </button>
              ))}
              {!split && (
                <>
                  <button className={main?.symbol === 'DEMO' ? 'chip active' : 'chip'} onClick={() => choose(pickOfDataset(demoDataset(), { kind: 'demo' }))}>
                    Demo data
                  </button>
                  <label className="chip">
                    Import CSV…
                    <input type="file" accept=".csv,.txt" hidden onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
                  </label>
                </>
              )}
            </div>
            {main && (
              <>
                <h3>Timeframe</h3>
                <div className="chips main-tf">
                  {TIMEFRAMES.filter((tf) => tf.seconds >= main.baseSeconds).map((tf) => (
                    <button key={tf.label} className={tf.seconds === tfSeconds ? 'chip active' : 'chip'} onClick={() => setTfSeconds(tf.seconds)}>
                      {tf.label}
                    </button>
                  ))}
                </div>
              </>
            )}
            {split && main && index && (
              <>
                <h2>Second chart</h2>
                <p className="muted small">Replays in sync with {main.symbol}. You place trades on the main chart.</p>
                <div className="chips second-pick">
                  {index
                    .filter((info) => info.symbol !== main.symbol)
                    .map((info) => (
                      <button
                        key={info.symbol}
                        className={second?.pick.symbol === info.symbol ? 'chip active' : 'chip'}
                        onClick={() => pickSecond(info)}
                      >
                        {label(info.symbol)}
                      </button>
                    ))}
                </div>
                {second && (
                  <>
                    <h3>Timeframe</h3>
                    <div className="chips second-tf">
                      {TIMEFRAMES.filter((tf) => tf.seconds >= second.pick.baseSeconds).map((tf) => (
                        <button
                          key={tf.label}
                          className={tf.seconds === second.tfSeconds ? 'chip active' : 'chip'}
                          onClick={() => setSecond({ ...second, tfSeconds: tf.seconds })}
                        >
                          {tf.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
            {main && !overlap && <p className="error">These two markets have no dates in common. Pick another second chart.</p>}
          </>
        );
      case 'account':
        return (
          <>
            <h2>Start date and account</h2>
            <label className="field">
              Start replay from
              <input type="date" value={start} min={toDateInput(first!)} max={toDateInput(last!)} onChange={(e) => setStart(e.target.value)} />
            </label>
            <span className="muted small">
              Data available {toDateInput(first!)} to {toDateInput(last!)}
            </span>
            <h3>Starting balance</h3>
            <div className="chips balance-pick">
              {BALANCES.map((b) => (
                <button key={b} className={Number(balance) === b ? 'chip active' : 'chip'} onClick={() => setBalance(String(b))}>
                  ${b / 1000}k
                </button>
              ))}
            </div>
            <div className="row account-setup">
              <label className="field">
                Balance (USD)
                <input type="number" min="100" step="100" value={balance} onChange={(e) => setBalance(e.target.value)} />
              </label>
              <label className="field">
                Spread (pips)
                <input type="number" min="0" step="0.1" value={spread} onChange={(e) => setSpread(e.target.value)} />
              </label>
              <label className="field">
                Commission ($ per lot, round turn)
                <input type="number" min="0" step="0.5" value={commission} onChange={(e) => setCommission(e.target.value)} />
              </label>
            </div>
            <p className="wizard-summary">
              {summary}
              {isChallenge && challenge && ` · ${challenge.name} challenge`}
              {Number(balance) > 0 && ` · $${Number(balance).toLocaleString()}`}
            </p>
          </>
        );
    }
  };

  return (
    <div className="setup">
      <h1>Trade Sim</h1>
      <p className="muted">Replay real market data bar by bar and trade it, on your own or as a prop firm challenge.</p>
      <button className="primary new-sim" onClick={openWizard}>
        + New sim
      </button>
      {!open && status && <p className="muted">{status}</p>}

      {sessions.length > 0 && (
        <>
          <h2>Your sessions</h2>
          <div className="sessions">
            {sessions.map((s) => {
              const pnl = s.trading.balance - s.startBalance;
              return (
                <div key={s.id} className="session-row">
                  <div className="grow">
                    <strong>{s.symbol}</strong> {tfLabel(s.tfSeconds)}
                    {s.second && (
                      <>
                        {' + '}
                        <strong>{s.second.symbol}</strong> {tfLabel(s.second.tfSeconds)}
                      </>
                    )}{' '}
                    <span className="muted small">from {toDateInput(s.startTime)}</span>
                    <div className="muted small">
                      {s.trading.history.length} trades ·{' '}
                      <span className={pnl >= 0 ? 'profit' : 'loss'}>{fmtMoney(pnl)}</span> ·{' '}
                      {s.endedAt ? 'finished' : 'in progress'} · saved {new Date(s.updatedAt).toLocaleString()}
                      {s.trading.challenge && (
                        <span className={`badge challenge-${s.trading.challenge.status}`}>
                          {s.trading.challenge.rules.name}: {s.trading.challenge.status}
                        </span>
                      )}
                    </div>
                  </div>
                  {s.endedAt ? (
                    <button onClick={() => onReport(s)}>Report</button>
                  ) : (
                    <button onClick={() => resume(s)}>Resume</button>
                  )}
                  <button onClick={() => remove(s)} title="Delete session">
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {open && (
        <div className="wizard-backdrop" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="wizard" role="dialog" aria-modal="true" aria-label="New sim">
            <div className="wizard-head">
              <span className="muted small">
                Step {stepNo + 1} of {steps.length}
              </span>
              <button className="wizard-close" onClick={() => setOpen(false)} title="Close">
                ✕
              </button>
            </div>
            <ol className="wizard-steps">
              {steps.map((s, i) => (
                <li key={s} className={i < stepNo ? 'done' : i === stepNo ? 'current' : ''}>
                  {i < stepNo ? (
                    <button onClick={() => go(s)}>{STEP_TITLES[s]}</button>
                  ) : (
                    <span>{STEP_TITLES[s]}</span>
                  )}
                </li>
              ))}
            </ol>
            <div className="wizard-body">
              {body()}
              {status && <p className="muted">{status}</p>}
            </div>
            <div className="wizard-foot">
              <button onClick={back}>{stepNo > 0 ? '← Back' : 'Cancel'}</button>
              {step === 'account' ? (
                <button className="primary" disabled={!ready.account || !ready.markets || loading} onClick={begin}>
                  Start sim
                </button>
              ) : (
                <button className="primary" disabled={!ready[step]} onClick={() => go(steps[stepNo + 1])}>
                  Next →
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
