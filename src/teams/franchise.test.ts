import {
  displayName,
  findDuplicateName,
  identityForSeason,
  isFranchise,
  normalizeHexColor,
  validateFranchiseInput,
  type Franchise,
  type FranchiseInput,
} from './franchise';

const input = (o: Partial<FranchiseInput> = {}): FranchiseInput => ({
  city: 'Richmond',
  name: 'Greyhounds',
  primaryColor: '#3c87f7',
  secondaryColor: '#ffffff',
  initialGrade: 'B',
  ...o,
});

const team = (id: string, name: string, city = 'Richmond'): Franchise => ({
  id,
  leagueId: 'l1',
  initialGrade: 'A',
  identities: [{ fromSeason: 1, city, name, primaryColor: '#000000', secondaryColor: '#ffffff' }],
});

describe('normalizeHexColor', () => {
  it.each([
    ['#FFF', '#ffffff'],
    ['fff', '#ffffff'],
    ['#A1B2C3', '#a1b2c3'],
    [' a1b2c3 ', '#a1b2c3'],
  ])('accepts %s', (text, expected) => expect(normalizeHexColor(text)).toBe(expected));

  it.each(['#12345', 'red', '', '#ggg', '#1234567'])('rejects %s', (text) =>
    expect(normalizeHexColor(text)).toBeNull(),
  );
});

describe('validateFranchiseInput', () => {
  it('accepts valid input and trims text', () => {
    const result = validateFranchiseInput(input({ city: '  Richmond ', name: ' Greyhounds ' }));
    expect(result).toEqual({
      ok: true,
      value: {
        initialGrade: 'B',
        identity: { fromSeason: 1, city: 'Richmond', name: 'Greyhounds', primaryColor: '#3c87f7', secondaryColor: '#ffffff' },
      },
    });
  });

  it('rejects empty, whitespace and 61-character city and name', () => {
    for (const bad of ['', '   ', 'x'.repeat(61)]) {
      const result = validateFranchiseInput(input({ city: bad, name: bad }));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(Object.keys(result.fields)).toEqual(['city', 'name']);
    }
    expect(validateFranchiseInput(input({ city: 'x'.repeat(60) })).ok).toBe(true);
  });

  it('rejects bad colors and grades', () => {
    const result = validateFranchiseInput(input({ primaryColor: 'red', secondaryColor: '', initialGrade: 'E' }));
    expect(result).toEqual({
      ok: false,
      fields: {
        primaryColor: expect.any(String),
        secondaryColor: expect.any(String),
        initialGrade: expect.any(String),
      },
    });
    const missing = validateFranchiseInput(input({ initialGrade: null }));
    expect(missing.ok).toBe(false);
  });
});

describe('displayName', () => {
  const identity = team('1', 'Greyhounds').identities[0];
  it('follows the naming style', () => {
    expect(displayName(identity, 'cityAndName')).toBe('Richmond Greyhounds');
    expect(displayName({ ...identity, name: 'AFC Richmond' }, 'nameOnly')).toBe('AFC Richmond');
  });
});

describe('identityForSeason', () => {
  it('picks the latest identity not after the season', () => {
    const f = team('1', 'Old');
    f.identities.push({ ...f.identities[0], fromSeason: 3, name: 'New' });
    expect(identityForSeason(f, 2)?.name).toBe('Old');
    expect(identityForSeason(f, 3)?.name).toBe('New');
    expect(identityForSeason(f, 0)).toBeNull();
  });
});

describe('findDuplicateName', () => {
  const teams = [team('1', 'Greyhounds'), team('2', 'Rovers', 'Leeds')];
  it('ignores case and outer spaces', () => {
    expect(findDuplicateName(teams, '  greyHOUNDS ')?.id).toBe('1');
  });
  it('allows a repeated city', () => {
    expect(findDuplicateName(teams, 'United')).toBeNull();
  });
  it('lets an edit keep its own name', () => {
    expect(findDuplicateName(teams, 'Greyhounds', '1')).toBeNull();
    expect(findDuplicateName(teams, 'Rovers', '1')?.id).toBe('2');
  });
});

describe('isFranchise', () => {
  it('accepts a valid document', () => expect(isFranchise(team('1', 'A'))).toBe(true));
  it.each([
    null,
    'x',
    { ...team('1', 'A'), id: '' },
    { ...team('1', 'A'), leagueId: 5 },
    { ...team('1', 'A'), initialGrade: 'E' },
    { ...team('1', 'A'), identities: [] },
    { ...team('1', 'A'), identities: [{ fromSeason: 1, city: 'x', name: 'y', primaryColor: 'red', secondaryColor: '#ffffff' }] },
    { ...team('1', 'A'), identities: [{ fromSeason: 0, city: 'x', name: 'y', primaryColor: '#ffffff', secondaryColor: '#ffffff' }] },
  ])('rejects malformed %#', (value) => expect(isFranchise(value)).toBe(false));
});
