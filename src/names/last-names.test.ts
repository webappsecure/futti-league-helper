import { normalizeName } from './normalize-name';
import { NAME_POOL } from './name-pool';

describe('committed last-name list', () => {
  it('is large', () => expect(NAME_POOL.length).toBeGreaterThan(50000));

  it('holds only normalized names', () => {
    expect(NAME_POOL.filter((name) => normalizeName(name) !== name)).toEqual([]);
  });

  it('is strictly sorted, so every name is unique', () => {
    for (let i = 1; i < NAME_POOL.length; i += 1) {
      if (!(NAME_POOL[i - 1] < NAME_POOL[i])) throw new Error(`Out of order at ${NAME_POOL[i]}`);
    }
  });

  it('has no curly apostrophes or non-ASCII characters', () => {
    expect(NAME_POOL.filter((name) => /[^\x20-\x7e]/.test(name))).toEqual([]);
  });

  it('keeps apostrophes and collapses accent variants', () => {
    expect(NAME_POOL).toContain("A'LEA");
    expect(NAME_POOL.filter((name) => name === 'MARTIN')).toHaveLength(1);
    expect(NAME_POOL.filter((name) => name.endsWith("'"))).toEqual([]);
    expect(NAME_POOL).toContain('PIETRE');
  });
});
