import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain JS module shared with the Node download script
import { encodeBars } from '../../scripts/codec.mjs';
import { decodeBars } from './load';

describe('compact bar format', () => {
  it('round-trips bars exactly, including gaps', () => {
    const raw = [
      [1_700_000_040, 1.10427, 1.10431, 1.1042, 1.1043],
      [1_700_000_100, 1.1043, 1.1043, 1.10401, 1.10405],
      [1_700_259_300, 1.105, 1.106, 1.104, 1.1055],
    ];
    const encoded = encodeBars('EURUSD', 60, 5, raw);
    expect(encoded.t).toEqual([0, 1, 4320]);
    const decoded = decodeBars(JSON.parse(JSON.stringify(encoded)));
    expect(decoded.bars.map((b) => [b.time, b.open, b.high, b.low, b.close])).toEqual(raw);
  });
});
