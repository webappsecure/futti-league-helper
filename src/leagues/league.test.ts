import {
  NAME_MAX_LENGTH,
  createLeagueId,
  isLeague,
  parseCount,
  validateLeagueInput,
  type LeagueInput,
} from './league';

const valid: LeagueInput = {
  name: 'Premier',
  size: 20,
  namingStyle: 'nameOnly',
  relegation: false,
  promotedCount: 0,
  demotedCount: 0,
};

const fieldsOf = (input: LeagueInput) => {
  const result = validateLeagueInput(input);
  return result.ok ? null : result.fields;
};

describe('validateLeagueInput', () => {
  it('accepts a valid non-relegation league and trims the name', () => {
    const result = validateLeagueInput({ ...valid, name: '  Premier  ' });
    expect(result).toEqual({
      ok: true,
      value: {
        name: 'Premier',
        size: 20,
        namingStyle: 'nameOnly',
        relegation: false,
        promotedCount: 0,
        demotedCount: 0,
      },
    });
  });

  it('rejects an empty or whitespace name', () => {
    expect(fieldsOf({ ...valid, name: '' })?.name).toBeDefined();
    expect(fieldsOf({ ...valid, name: '   ' })?.name).toBeDefined();
  });

  it('allows a name of the maximum length and rejects one character more', () => {
    expect(fieldsOf({ ...valid, name: 'a'.repeat(NAME_MAX_LENGTH) })).toBeNull();
    expect(fieldsOf({ ...valid, name: 'a'.repeat(NAME_MAX_LENGTH + 1) })?.name).toBeDefined();
  });

  it('accepts exactly the eight sizes', () => {
    for (const size of [6, 8, 10, 12, 14, 16, 18, 20]) {
      expect(fieldsOf({ ...valid, size })).toBeNull();
    }
    for (const size of [null, 4, 7, 9, 22, 0, 12.5]) {
      expect(fieldsOf({ ...valid, size })?.size).toBeDefined();
    }
  });

  it('requires a naming style', () => {
    expect(fieldsOf({ ...valid, namingStyle: null })?.namingStyle).toBeDefined();
    expect(fieldsOf({ ...valid, namingStyle: 'cityAndName' })).toBeNull();
    expect(fieldsOf({ ...valid, namingStyle: 'other' as never })?.namingStyle).toBeDefined();
  });

  describe('relegation counts', () => {
    const relegation = { ...valid, size: 10, relegation: true };

    it('accepts 1 and 0 or 0 and 1 and up to the league size', () => {
      expect(fieldsOf({ ...relegation, promotedCount: 1, demotedCount: 0 })).toBeNull();
      expect(fieldsOf({ ...relegation, promotedCount: 0, demotedCount: 1 })).toBeNull();
      expect(fieldsOf({ ...relegation, promotedCount: 10, demotedCount: 10 })).toBeNull();
    });

    it('rejects both counts at 0', () => {
      expect(fieldsOf({ ...relegation, promotedCount: 0, demotedCount: 0 })?.counts).toBeDefined();
    });

    it('rejects negative, fractional, too large and non-numeric counts', () => {
      expect(fieldsOf({ ...relegation, promotedCount: -1, demotedCount: 1 })?.promotedCount).toBeDefined();
      expect(fieldsOf({ ...relegation, promotedCount: 1, demotedCount: 1.5 })?.demotedCount).toBeDefined();
      expect(fieldsOf({ ...relegation, promotedCount: 11, demotedCount: 1 })?.promotedCount).toBeDefined();
      expect(fieldsOf({ ...relegation, promotedCount: 1, demotedCount: NaN })?.demotedCount).toBeDefined();
    });

    it('does not also report the combined rule when a count is already invalid', () => {
      expect(fieldsOf({ ...relegation, promotedCount: -1, demotedCount: 0 })?.counts).toBeUndefined();
    });

    it('resets both counts to 0 when relegation is off', () => {
      const result = validateLeagueInput({ ...valid, promotedCount: 3, demotedCount: 2 });
      expect(result.ok && [result.value.promotedCount, result.value.demotedCount]).toEqual([0, 0]);
    });

    it('ignores invalid counts while relegation is off', () => {
      expect(fieldsOf({ ...valid, promotedCount: NaN, demotedCount: -4 })).toBeNull();
    });

    it('skips the upper bound until a size is chosen', () => {
      const fields = fieldsOf({ ...relegation, size: null, promotedCount: 99, demotedCount: 0 });
      expect(fields?.promotedCount).toBeUndefined();
      expect(fields?.size).toBeDefined();
    });
  });

  it('reports several problems at once', () => {
    const fields = fieldsOf({ ...valid, name: '', size: null, namingStyle: null });
    expect(Object.keys(fields ?? {}).sort()).toEqual(['name', 'namingStyle', 'size']);
  });
});

describe('parseCount', () => {
  it('reads whole digits and treats empty text as 0', () => {
    expect(parseCount('3')).toBe(3);
    expect(parseCount(' 12 ')).toBe(12);
    expect(parseCount('')).toBe(0);
    expect(parseCount('   ')).toBe(0);
  });

  it('turns anything else into NaN', () => {
    for (const text of ['-1', '1.5', 'abc', '1e2', '3 4']) expect(parseCount(text)).toBeNaN();
  });
});

describe('createLeagueId', () => {
  it('is reproducible with an injected clock and random source', () => {
    expect(createLeagueId(() => 36, () => 0)).toBe('10-000000');
    expect(createLeagueId(() => 36, () => 35 / 36)).toBe('10-z00000');
  });

  it('differs between calls with the real clock and random', () => {
    const ids = new Set(Array.from({ length: 200 }, () => createLeagueId()));
    expect(ids.size).toBe(200);
  });
});

describe('isLeague', () => {
  const league = { id: 'a-1', ...valid };

  it('accepts a saved league', () => {
    expect(isLeague(league)).toBe(true);
  });

  it('accepts valid link ids and rejects empty or non-string ones', () => {
    expect(isLeague({ ...league, leagueAboveId: 'b-2', leagueBelowId: 'c-3' })).toBe(true);
    expect(isLeague({ ...league, leagueAboveId: '' })).toBe(false);
    expect(isLeague({ ...league, leagueBelowId: 5 })).toBe(false);
    expect(isLeague({ ...league, leagueBelowId: null })).toBe(false);
  });

  it('rejects other shapes and values', () => {
    expect(isLeague(null)).toBe(false);
    expect(isLeague('text')).toBe(false);
    expect(isLeague({ ...league, id: '' })).toBe(false);
    expect(isLeague({ ...league, size: 7 })).toBe(false);
    expect(isLeague({ ...league, name: ' padded ' })).toBe(false);
    expect(isLeague({ ...league, namingStyle: 'x' })).toBe(false);
    expect(isLeague({ ...league, relegation: 'yes' })).toBe(false);
    expect(isLeague({ ...league, relegation: true, promotedCount: 0, demotedCount: 0 })).toBe(false);
  });
});
