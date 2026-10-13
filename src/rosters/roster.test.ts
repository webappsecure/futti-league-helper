import { rngFromDice } from '@/rules/test-rng';
import {
  generateGoalie,
  generateRoster,
  generateStandard,
  isRoster,
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
    ['age out of range', () => { const r = clone(); r.players[0].age = 31; return r; }],
    ['total above 8', () => { const r = clone(); r.players[0].offense = 7; r.players[0].defense = 7; return r; }],
    ['bad stars', () => { const r = clone(); r.players[0].controlStars = 3; return r; }],
    ['invalid goaltending', () => { const r = clone(); r.players[6].goaltending = 37; return r; }],
    ['missing rolls', () => { const r = clone(); delete r.players[0].rolls; return r; }],
  ])('rejects %s', (_label, make) => {
    expect(isRoster(make())).toBe(false);
  });
});
