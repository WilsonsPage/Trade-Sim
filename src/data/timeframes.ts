export interface Timeframe {
  label: string;
  seconds: number;
}

export const TIMEFRAMES: Timeframe[] = [
  { label: 'M1', seconds: 60 },
  { label: 'M5', seconds: 300 },
  { label: 'M15', seconds: 900 },
  { label: 'M30', seconds: 1800 },
  { label: 'H1', seconds: 3600 },
  { label: 'H4', seconds: 14_400 },
  { label: 'D1', seconds: 86_400 },
];
