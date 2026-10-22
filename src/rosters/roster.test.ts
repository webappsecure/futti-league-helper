import { rngFromDice } from '@/rules/test-rng';
import {
  generateDraftGoalie,
  generateDraftStandard,
  generateGoalie,
  generateRoster,
  generateStandard,
  isDraftee,
  isRoster,
  NAME_MAX_LENGTH,
  renamePlayer,
  rerollPlayer,
  type Roster,
} from './roster';

let counter = 0;
const nextId = () => `p-${++counter}`;
const names = (...list: string[]) => {
  let i = 0;
  return () => list[i++ % list.length];
};

describe('generateStandard', () => {
  it('records the values and the dice behind them', () => {
    // age 3+4=7 -> 25; grade C total 2d6 1+1=2 -> 5; split d6 4 -> 3/2 band; stars 6+6; sp 1+1
    const player = generateStandard('C', rngFromDice(3, 4, 1, 1, 4, 3, 3, 1, 1), () => 'SMITH', nextId);
    expect(player.name).toBe('SMITH');
    expect(player.age).toBe(25);
    expect(player.rolls.age).toBe(7);
    expect(player.rolls.total).toBe(2);
    expect(player.offense + player.defense).toBe(5);
    expect(player.rolls.split).toBe(4);
    expect(player.rolls.stars).toBe(6);
    expect(player.sportsmanship).toBe(1);
    expect(player.rolls.sportsmanship).toBe(2);
  });

  it('has no split roll for a total of 2', () => {
    // grade C, 2d6 = 4 -> total 2
    const player = generateStandard('C', rngFromDice(1, 1, 2, 2, 1, 1, 1, 1), () => 'LEE', nextId);
    expect(player.offense).toBe(1);
    expect(player.defense).toBe(1);
    expect(player.rolls.split).toBeNull();
  });
});

describe('generateGoalie', () => {
  it('uses the goaltending chart for the grade', () => {
    // age 1+1 -> 20; goaltending grade A 6+6=12 -> 46; sp 1+1 -> 1
    const g = generateGoalie('A', rngFromDice(1, 1, 6, 6, 1, 1), () => 'KHAN', nextId);
    expect(g.age).toBe(20);
    expect(g.goaltending).toBe(46);
    expect(g.rolls.goaltending).toBe(12);
    expect(g.sportsmanship).toBe(1);
  });
});

function sample(): Roster {
  return generateRoster('F1', 'L1', 'B', Math.random, names('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'), nextId);
}

describe('generateRoster', () => {
  it('makes 6 standard players then 2 goaltenders with distinct ids', () => {
    const roster = sample();
    expect(roster.players.map((p) => p.kind)).toEqual([
      'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'goalie', 'goalie',
    ]);
    expect(new Set(roster.players.map((p) => p.id)).size).toBe(8);
    expect(isRoster(roster)).toBe(true);
  });

  it('always yields valid rosters', () => {
    for (let i = 0; i < 200; i += 1) {
      for (const grade of ['A', 'B', 'C', 'D', 'F'] as const) {
        const r = generateRoster('F', 'L', grade, Math.random, names('X', 'Y', 'Z'), () => `i${Math.random()}`);
        expect(isRoster(r)).toBe(true);
      }
    }
  });
});

describe('rerollPlayer', () => {
  it('replaces only the target slot', () => {
    const roster = sample();
    const target = roster.players[7];
    const next = rerollPlayer(roster, target.id, 'B', Math.random, () => 'NEW', nextId)!;
    expect(next.players.slice(0, 7)).toEqual(roster.players.slice(0, 7));
    expect(next.players[7].kind).toBe('goalie');
    expect(next.players[7].id).not.toBe(target.id);
    expect(next.players[7].name).toBe('NEW');
    expect(isRoster(next)).toBe(true);
  });

  it('returns null for an unknown player', () => {
    expect(rerollPlayer(sample(), 'nope', 'B', Math.random, () => 'X', nextId)).toBeNull();
  });
});

describe('isRoster', () => {
  const clone = () => JSON.parse(JSON.stringify(sample())) as any;

  it.each([
    ['not an object', () => null],
    ['missing franchise id', () => ({ ...clone(), franchiseId: '' })],
    ['wrong player count', () => ({ ...clone(), players: clone().players.slice(1) })],
    ['wrong order', () => { const r = clone(); r.players.reverse(); return r; }],
    ['duplicate ids', () => { const r = clone(); r.players[1].id = r.players[0].id; return r; }],
    ['unnormalized name', () => { const r = clone(); r.players[0].name = 'smith'; return r; }],
    ['age out of range', () => { const r = clone(); r.players[0].age = 17; return r; }],
    ['non-string league id', () => ({ ...clone(), leagueId: 5 })],
    ['empty league id', () => ({ ...clone(), leagueId: '' })],
    ['total above 8', () => { const r = clone(); r.players[0].offense = 7; r.players[0].defense = 7; return r; }],
    ['bad stars', () => { const r = clone(); r.players[0].controlStars = 3; return r; }],
    ['invalid goaltending', () => { const r = clone(); r.players[6].goaltending = 37; return r; }],
    ['missing rolls', () => { const r = clone(); delete r.players[0].rolls; return r; }],
  ])('rejects %s', (_label, make) => {
    expect(isRoster(make())).toBe(false);
  });
});

describe('isRoster ages and unassigned teams', () => {
  it('accepts veterans of any age from 18 and a roster with no league', () => {
    const r = JSON.parse(JSON.stringify(sample()));
    r.players[0].age = 18;
    r.players[1].age = 35;
    expect(isRoster(r)).toBe(true);
    delete r.leagueId;
    expect(isRoster(r)).toBe(true);
  });
});

describe('renamePlayer', () => {
  it('normalizes the typed name and changes nothing else', () => {
    const roster = sample();
    const target = roster.players[2];
    const r = renamePlayer(roster, target.id, '  de la Cruz-Ñuñez ', new Set());
    if (!r.ok) throw new Error('rename');
    expect(r.value.players[2]).toEqual({ ...target, name: 'DE LA CRUZ-NUNEZ' });
    expect(r.value.players.filter((_, i) => i !== 2)).toEqual(roster.players.filter((_, i) => i !== 2));
    expect(isRoster(r.value)).toBe(true);
  });

  it('renames a goaltender', () => {
    const roster = sample();
    const r = renamePlayer(roster, roster.players[7].id, 'Zed', new Set());
    expect(r.ok && r.value.players[7]).toMatchObject({ kind: 'goalie', name: 'ZED' });
  });

  it('rejects invalid text', () => {
    const roster = sample();
    for (const raw of ['', '   ', 'R2D2', 'SMITH!']) {
      expect(renamePlayer(roster, roster.players[0].id, raw, new Set())).toEqual({
        ok: false,
        error: { kind: 'invalid-name' },
      });
    }
  });

  it('rejects an unavailable name', () => {
    const roster = sample();
    expect(renamePlayer(roster, roster.players[0].id, 'smith', new Set(['SMITH']))).toEqual({
      ok: false,
      error: { kind: 'name-taken' },
    });
  });

  it('accepts the player\'s current name', () => {
    const roster = sample();
    const current = roster.players[0];
    const r = renamePlayer(roster, current.id, current.name, new Set([current.name]));
    expect(r).toEqual({ ok: true, value: roster });
  });

  it('rejects an unknown player', () => {
    expect(renamePlayer(sample(), 'nope', 'X', new Set())).toEqual({ ok: false, error: { kind: 'not-found' } });
  });

  it('limits the length of a typed name', () => {
    const roster = sample();
    const id = roster.players[0].id;
    expect(renamePlayer(roster, id, 'A'.repeat(NAME_MAX_LENGTH), new Set()).ok).toBe(true);
    expect(renamePlayer(roster, id, 'A'.repeat(NAME_MAX_LENGTH + 1), new Set())).toEqual({
      ok: false,
      error: { kind: 'invalid-name' },
    });
  });
});

describe('draftees', () => {
  it('builds a standard draftee from the draft charts', () => {
    // age 1+1=2 -> 18; draft total 6+6=12 -> 8; split d6 3; stars 1+1; sp 1+1
    const d = generateDraftStandard(rngFromDice(1, 1, 6, 6, 3, 1, 1, 1, 1), () => 'ROE', nextId);
    expect(d.age).toBe(18);
    expect(d.rolls).toMatchObject({ age: 2, total: 12, split: 3 });
    expect(d.offense + d.defense).toBe(8);
    expect(isDraftee(d)).toBe(true);
  });

  it('builds a goaltender draftee from the draft goaltending chart', () => {
    // age 6+6=12 -> 22; goaltending 4+4=8 -> 41; sp 1+1
    const g = generateDraftGoalie(rngFromDice(6, 6, 4, 4, 1, 1), () => 'ROE', nextId);
    expect(g.age).toBe(22);
    expect(g.goaltending).toBe(41);
    expect(isDraftee(g)).toBe(true);
  });

  it('accepts only ages 18 to 22', () => {
    const d = generateDraftStandard(rngFromDice(1, 1, 6, 6, 3, 1, 1, 1, 1), () => 'ROE', nextId);
    expect(isDraftee({ ...d, age: 22 })).toBe(true);
    expect(isDraftee({ ...d, age: 17 })).toBe(false);
    expect(isDraftee({ ...d, age: 23 })).toBe(false);
    expect(isDraftee({ ...d, defense: 9 })).toBe(false);
    expect(isDraftee(null)).toBe(false);
    expect(isDraftee({ ...d, kind: 'other' })).toBe(false);
  });
});
