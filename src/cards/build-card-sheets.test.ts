import type { League } from '@/leagues/league';
import type { Roster, RosterPlayer } from '@/rosters/roster';
import type { Franchise } from '@/teams/franchise';
import { buildCardSheets, type CardSheetsInput } from './build-card-sheets';

const PIXEL = 'data:image/png;base64,iVBORw0KGgo=';
const FONT = 'data:font/ttf;base64,AAEAAA==';
const images = { player1: PIXEL, player2: PIXEL, player3: PIXEL, goalie: PIXEL };

const league = (namingStyle: League['namingStyle'] = 'nameOnly'): League => ({
  id: 'L1',
  name: 'Top League',
  size: 8,
  namingStyle,
  relegation: false,
  promotedCount: 0,
  demotedCount: 0,
});

function team(id: string, over: Partial<Franchise['identities'][number]> = {}): Franchise {
  return {
    id,
    leagueId: 'L1',
    initialGrade: 'C',
    identities: [
      { fromSeason: 1, city: 'Lima', name: `Team ${id}`, primaryColor: '#85439a', secondaryColor: '#ffcc03', ...over },
    ],
  };
}

function roster(franchiseId: string, stars = 0): Roster {
  const players: RosterPlayer[] = [];
  for (let i = 0; i < 6; i++) {
    players.push({
      id: `${franchiseId}-s${i}`,
      kind: 'standard',
      name: `Std${i}`,
      age: 25,
      offense: 3,
      defense: 2,
      sportsmanship: 4,
      controlStars: (i === 0 ? stars : 0) as 0 | 1 | 2,
      rolls: { age: 7, total: 5, split: 1, stars: 5, sportsmanship: 6 },
    });
  }
  for (let i = 0; i < 2; i++) {
    players.push({
      id: `${franchiseId}-g${i}`,
      kind: 'goalie',
      name: `Goal${i}`,
      age: 25,
      goaltending: 33 + i,
      sportsmanship: 2,
      rolls: { age: 7, goaltending: 5, sportsmanship: 6 },
    });
  }
  return { franchiseId, leagueId: 'L1', players };
}

function input(ids: string[], over: Partial<CardSheetsInput> = {}): CardSheetsInput {
  return {
    league: league(),
    seasonIndex: 1,
    franchises: ids.map((id) => team(id)),
    rosters: ids.map((id) => roster(id)),
    images,
    font: FONT,
    pillFont: FONT,
    ...over,
  };
}

const count = (html: string, needle: string) => html.split(needle).length - 1;

function built(i: CardSheetsInput) {
  const r = buildCardSheets(i);
  if (!r.ok) throw new Error(r.message);
  return r;
}

describe('buildCardSheets', () => {
  it.each([
    [1, 1],
    [4, 1],
    [5, 2],
  ])('prints %i teams on %i sheets of 8 cards per team', (teams, pages) => {
    const r = built(input(Array.from({ length: teams }, (_, i) => `t${i}`)));
    expect(r.pages).toBe(pages);
    expect(count(r.html, '<section class="sheet">')).toBe(pages);
    expect(count(r.html, 'class="card')).toBe(teams * 8);
  });

  it('sets the page and card geometry', () => {
    const { html } = built(input(['a']));
    expect(html).toContain('size: 11in 8.5in; margin: 0.25in');
    expect(html).toContain('width: 1.312in; height: 2in');
    expect(html).toContain('opacity: 0.15');
  });

  it('embeds the card and pill fonts', () => {
    const { html } = built(input(['a']));
    expect(html).toContain('@font-face { font-family: "Futti Card"; src: url("' + FONT + '")');
    expect(html).toContain('@font-face { font-family: "Futti Pill"; src: url("' + FONT + '")');
  });

  it('labels the standard card stats with the British spellings', () => {
    const { html } = built(input(['a']));
    expect(count(html, '<span class="stat-label">OFFENCE:</span>')).toBe(6);
    expect(count(html, '<span class="stat-label">DEFENCE:</span>')).toBe(6);
    expect(count(html, '<span class="sp-label">SPORTSMANSHIP</span>')).toBe(6);
  });

  it('shows the sportsmanship value on standard and goaltender cards', () => {
    const { html } = built(input(['a']));
    expect(count(html, '<span class="sp-value" ')).toBe(6);
    expect(count(html, '<div class="sp-value" ')).toBe(2);
  });

  it('sets pill text at 75% width, narrower for long text', () => {
    const r = roster('a');
    r.players[0] = { ...r.players[0], name: 'Maldonado-Rodriguez de la Cruz' };
    const f = team('a', { name: 'Rio' });
    const { html } = built(input(['a'], { rosters: [r], franchises: [f] }));
    expect(html).toMatch(/<span style="transform:scaleX\(0\.[0-6]\d*\)">MALDONADO-RODRIGUEZ DE LA CRUZ<\/span>/);
    expect(html).toContain('<span style="transform:scaleX(0.75)">STD1</span>');
    expect(html).toContain('<span style="transform:scaleX(0.75)">RIO</span>');
  });

  it('shows ratings, labels and stars on standard cards', () => {
    const { html } = built(input(['a'], { rosters: [roster('a', 2)] }));
    expect(html).toContain('OFFENCE:');
    expect(html).toContain('DEFENCE:');
    expect(html).toContain('STD0');
    expect(html).toContain('>★★</div>');
    expect(count(html, '★')).toBe(2);
  });

  it('shows one star and none', () => {
    expect(count(built(input(['a'], { rosters: [roster('a', 1)] })).html, '★')).toBe(1);
    expect(count(built(input(['a'])).html, '★')).toBe(0);
  });

  it('shows the rating and no stars on goaltender cards', () => {
    const { html } = built(input(['a'], { rosters: [roster('a', 2)] }));
    const goalies = html.split('goalie-card').slice(1);
    expect(goalies).toHaveLength(2);
    expect(goalies[0]).toContain('GOALTENDING');
    expect(goalies[0]).toContain('>33</div>');
    expect(goalies[1]).toContain('>34</div>');
    expect(goalies[0]).toContain('<div class="stat-label">GOALTENDING</div>');
    expect(goalies[0]).toContain('<div class="sp-label">SPORTSMANSHIP</div>');
    expect(goalies[0]).toContain('<div class="num rating" ');
    expect(goalies.join('')).not.toContain('★');
  });

  it('prints the name for nameOnly leagues and the city for cityAndName leagues, in capitals', () => {
    expect(count(built(input(['a'])).html, '>TEAM A</span></div>')).toBe(8);
    const city = built(input(['a'], { league: league('cityAndName') })).html;
    expect(count(city, '>LIMA</span></div>')).toBe(8);
    expect(city).not.toContain('TEAM A');
  });

  it('uses the primary-pill look when the colors contrast', () => {
    const { html } = built(input(['a']));
    expect(html).toContain('background:#85439a;color:#ffcc03');
    expect(html).not.toContain('color:#ffffff');
  });

  it('uses the Los Cerricos look when the colors are close', () => {
    const f = team('a', { primaryColor: '#da143b', secondaryColor: '#0047ab' });
    const { html } = built(input(['a'], { franchises: [f] }));
    expect(html).toContain('class="pill top" style="background:#da143b;color:#ffffff"');
    expect(html).toContain('class="pill bottom" style="background:#0047ab;color:#ffffff"');
  });

  it('mirrors only the second card of each pair', () => {
    const { html } = built(input(['a']));
    const bgs = [...html.matchAll(/class="bg bg-(\w+)( mirrored)?"/g)].map((m) => [m[1], !!m[2]]);
    expect(bgs).toEqual([
      ['player1', false],
      ['player1', true],
      ['player2', false],
      ['player2', true],
      ['player3', false],
      ['player3', true],
      ['goalie', false],
      ['goalie', true],
    ]);
  });

  it('escapes user text', () => {
    const r = roster('a');
    r.players[0] = { ...r.players[0], name: "O'Brien <b>" };
    const f = team('a', { name: 'A&B' });
    const { html } = built(input(['a'], { rosters: [r], franchises: [f] }));
    expect(html).toContain('O&#39;BRIEN &lt;B&gt;');
    expect(html).toContain('A&amp;B');
    expect(html).not.toContain('<B>');
  });

  it('uses the identity in effect for the season', () => {
    const f = team('a');
    f.identities.push({ fromSeason: 2, city: 'Quito', name: 'Later', primaryColor: '#000000', secondaryColor: '#ffffff' });
    expect(built(input(['a'], { franchises: [f], seasonIndex: 1 })).html).toContain('TEAM A');
    expect(built(input(['a'], { franchises: [f], seasonIndex: 2 })).html).toContain('LATER');
  });

  it('builds nothing when data is missing or malformed', () => {
    expect(buildCardSheets(input([]))).toMatchObject({ ok: false, reason: 'no-teams' });
    expect(buildCardSheets(input(['a'], { rosters: [] }))).toMatchObject({ ok: false, reason: 'missing-data' });
    expect(buildCardSheets(input(['a'], { seasonIndex: 0 }))).toMatchObject({ ok: false, reason: 'missing-data' });
    expect(
      buildCardSheets(input(['a'], { franchises: [team('a', { primaryColor: 'red;}' })] })),
    ).toMatchObject({ ok: false, reason: 'missing-data' });
    const short = roster('a');
    short.players.pop();
    expect(buildCardSheets(input(['a'], { rosters: [short] }))).toMatchObject({ ok: false, reason: 'invalid-roster' });
    const swapped = roster('a');
    swapped.players.reverse();
    expect(buildCardSheets(input(['a'], { rosters: [swapped] }))).toMatchObject({ ok: false, reason: 'invalid-roster' });
    expect(
      buildCardSheets(input(['a'], { images: { ...images, goalie: 'x");}' } })),
    ).toMatchObject({ ok: false, reason: 'invalid-image' });
    expect(buildCardSheets(input(['a'], { font: 'url(x)' }))).toMatchObject({ ok: false, reason: 'invalid-image' });
    expect(buildCardSheets(input(['a'], { pillFont: 'url(x)' }))).toMatchObject({ ok: false, reason: 'invalid-image' });
  });
});
