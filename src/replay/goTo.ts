/** Market session opens, in each centre's local time (so daylight saving is handled). */
export const SESSIONS = [
  { label: 'Tokyo open', zone: 'Asia/Tokyo', hour: 9 },
  { label: 'London open', zone: 'Europe/London', hour: 8 },
  { label: 'New York open', zone: 'America/New_York', hour: 8 },
] as const;

/** Offset of `zone` from UTC at `utcSeconds`, in seconds. */
function zoneOffset(zone: string, utcSeconds: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(utcSeconds * 1000));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const local = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) / 1000;
  return local - utcSeconds;
}

/** The first weekday `hour`:00 in `zone` that is strictly after `after` (UTC seconds). */
export function nextLocalTime(after: number, zone: string, hour: number): number {
  const day = 86400;
  for (let d = 0; d < 10; d++) {
    const base = Math.floor((after + zoneOffset(zone, after)) / day) * day + d * day; // local midnight, as if UTC
    const wall = base + hour * 3600;
    // Convert local wall time to UTC; re-check the offset at the result for DST changes.
    let utc = wall - zoneOffset(zone, wall);
    utc = wall - zoneOffset(zone, utc);
    const weekday = new Date(wall * 1000).getUTCDay();
    if (utc > after && weekday !== 0 && weekday !== 6) return utc;
  }
  return after;
}
