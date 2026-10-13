import { pickRandomName } from './pick-name';

const pool = ['ABEL', 'BAKER', 'CLARK', 'DAVIS'];
const none = new Set<string>();

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe('pickRandomName', () => {
  it('is reproducible with the same seed', () => {
    const a = Array.from({ length: 20 }, ((rng) => () => pickRandomName(pool, none, rng))(seeded(7)));
    const b = Array.from({ length: 20 }, ((rng) => () => pickRandomName(pool, none, rng))(seeded(7)));
    expect(a).toEqual(b);
  });

  it('can return every name in the pool', () => {
    const rng = seeded(1);
    const seen = new Set(Array.from({ length: 200 }, () => pickRandomName(pool, none, rng)));
    expect(seen).toEqual(new Set(pool));
  });

  it('never returns an unavailable name', () => {
    const rng = seeded(3);
    const unavailable = new Set(['ABEL', 'CLARK']);
    for (let i = 0; i < 300; i += 1) {
      expect(unavailable.has(pickRandomName(pool, unavailable, rng) as string)).toBe(false);
    }
  });

  it('returns null for an empty pool and when every name is unavailable', () => {
    expect(pickRandomName([], none, seeded(1))).toBeNull();
    expect(pickRandomName(pool, new Set(pool), seeded(1))).toBeNull();
  });

  it('falls back to a scan when random probes keep missing', () => {
    const unavailable = new Set(['ABEL', 'BAKER', 'CLARK']);
    expect(pickRandomName(pool, unavailable, () => 0)).toBe('DAVIS');
  });

  it('rejects an out-of-range random value', () => {
    expect(() => pickRandomName(pool, none, () => 1)).toThrow(RangeError);
    expect(() => pickRandomName(pool, none, () => -0.1)).toThrow(RangeError);
  });
});
