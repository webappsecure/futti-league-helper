import type { League } from './league';
import { listLeagues, type LeagueResult } from './league-repository';
import { chainLeagueIds, linkProblem } from './league-links';
import { FRANCHISE_COLLECTION } from '@/teams/franchise-repository';
import { findDuplicateName, identityForSeason, isFranchise, type Franchise } from '@/teams/franchise';
import { LEAGUE_COLLECTION } from './league';
import type { Database } from '@/storage/types';

export type LinkError =
  | { kind: 'link'; message: string }
  | { kind: 'not-found' }
  | { kind: 'storage'; error: Error };

export type LinkResult = { ok: true } | { ok: false; error: LinkError };

const OK: LinkResult = { ok: true };
const refuse = (message: string): LinkResult => ({ ok: false, error: { kind: 'link', message } });

function fromListing(result: LeagueResult<unknown>): LinkResult | null {
  if (result.ok) return null;
  const { error } = result;
  return { ok: false, error: error.kind === 'storage' ? error : { kind: 'storage', error: new Error('Could not read leagues.') } };
}

/** Links `upper` directly above `lower`. Rules are re-checked on fresh data; both sides are written together. */
export async function linkLeagues(db: Database, upperId: string, lowerId: string): Promise<LinkResult> {
  const listed = await listLeagues(db);
  const failed = fromListing(listed);
  if (failed || !listed.ok) return failed as LinkResult;
  const { leagues } = listed.value;
  const upper = leagues.find((l) => l.id === upperId);
  const lower = leagues.find((l) => l.id === lowerId);
  if (!upper || !lower) return { ok: false, error: { kind: 'not-found' } };

  const problem = linkProblem(upper, lower, leagues);
  if (problem) return refuse(problem);

  const stored = await db.list<unknown>(FRANCHISE_COLLECTION);
  if (!stored.ok) return { ok: false, error: { kind: 'storage', error: stored.error } };
  const teams = stored.value.map((doc) => doc.value).filter(isFranchise);
  const teamsOf = (league: League): Franchise[] => {
    const ids = chainLeagueIds(league, leagues);
    return teams.filter((t) => ids.includes(t.leagueId));
  };
  const upperTeams = teamsOf(upper);
  for (const team of teamsOf(lower)) {
    const identity = identityForSeason(team, 1);
    if (identity && findDuplicateName(upperTeams, identity.name)) {
      return refuse(`Both sides have a team named "${identity.name}". Rename one first.`);
    }
  }

  const written = await db.batch([
    { type: 'put', collection: LEAGUE_COLLECTION, id: upper.id, value: { ...upper, leagueBelowId: lower.id } },
    { type: 'put', collection: LEAGUE_COLLECTION, id: lower.id, value: { ...lower, leagueAboveId: upper.id } },
  ]);
  return written.ok ? OK : { ok: false, error: { kind: 'storage', error: written.error } };
}

/** Removes the link between `upper` and `lower` from both sides. */
export async function unlinkLeagues(db: Database, upperId: string, lowerId: string): Promise<LinkResult> {
  const listed = await listLeagues(db);
  const failed = fromListing(listed);
  if (failed || !listed.ok) return failed as LinkResult;
  const { leagues } = listed.value;
  const upper = leagues.find((l) => l.id === upperId);
  const lower = leagues.find((l) => l.id === lowerId);
  if (!upper || !lower) return { ok: false, error: { kind: 'not-found' } };

  const { leagueBelowId: _below, ...upperRest } = upper;
  const { leagueAboveId: _above, ...lowerRest } = lower;
  const written = await db.batch([
    { type: 'put', collection: LEAGUE_COLLECTION, id: upper.id, value: upper.leagueBelowId === lower.id ? upperRest : upper },
    { type: 'put', collection: LEAGUE_COLLECTION, id: lower.id, value: lower.leagueAboveId === upper.id ? lowerRest : lower },
  ]);
  return written.ok ? OK : { ok: false, error: { kind: 'storage', error: written.error } };
}
