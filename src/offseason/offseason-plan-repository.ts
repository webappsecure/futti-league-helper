import type { League } from '@/leagues/league';
import { createId } from '@/leagues/ids';
import { chainLeagueIds, leagueAbove, leagueBelow } from '@/leagues/league-links';
import { listLeagues } from '@/leagues/league-repository';
import { NAME_POOL } from '@/names/name-pool';
import { getBurnedNames } from '@/names/name-registry';
import { namePicker } from '@/rosters/roster-repository';
import { NamesExhaustedError } from '@/rosters/roster';
import type { Rng } from '@/rules/dice';
import { acceptQueue } from '@/seasons/accept-queue';
import type { Season } from '@/seasons/season';
import { getSeasonArchive } from '@/seasons/season-archive-repository';
import { FRANCHISE_COLLECTION } from '@/teams/franchise-repository';
import { identityForSeason, isFranchise, validateIdentityInput, type IdentityFieldErrors } from '@/teams/franchise';
import { getLeagueSeason } from '@/seasons/season-repository';
import { fail as failResult, ok, type Database, type Result } from '@/storage/types';
import { buildNewTeam, openVacancies } from './new-teams';
import { arrivalsAreCurrent, buildArrivals, expectedArrivals, type ArrivalSource, type ExpectedArrival } from './arrivals';
import {
  departureErrorText,
  isOffseasonPlan,
  OFFSEASON_PLAN_COLLECTION,
  stagedPlayerNames,
  validateDepartures,
  type DepartureError,
  type OffseasonPlan,
  type StagedArrival,
  type StagedNewTeam,
} from './offseason-plan';

export type BlockedReason = 'no-season' | 'not-offseason' | 'no-archive' | 'no-plan';

/** A linked league whose teams cannot be staged yet, and why. */
export interface BlockedNeighbor {
  leagueId: string;
  leagueName: string;
  direction: 'above' | 'below';
  reason: BlockedReason;
}

export type PlanError =
  | { kind: DepartureError }
  | { kind: 'no-plan' }
  | { kind: 'validation'; fields: IdentityFieldErrors }
  | { kind: 'no-vacancy' }
  | { kind: 'not-found' }
  | { kind: 'no-names' }
  | { kind: 'arrivals-not-ready' }
  | { kind: 'unknown-player' }
  | { kind: 'protection-incomplete' }
  | { kind: 'aging-not-run' }
  | { kind: 'draft-complete' }
  | { kind: 'not-in-pool' }
  | { kind: 'no-picks' }
  | { kind: 'free-agency-incomplete' }
  | { kind: 'pool-not-generated' }
  | { kind: 'picks-exist' }
  | { kind: 'rookie-draft-incomplete' }
  | { kind: 'kind-not-needed' }
  | { kind: 'blocked'; blocked: BlockedNeighbor[] }
  | { kind: 'missing-team'; franchiseId: string }
  | { kind: 'no-season' }
  | { kind: 'not-offseason' }
  | { kind: 'no-archive' }
  | { kind: 'storage'; error: Error };

export type PlanResult = { ok: true; value: OffseasonPlan } | { ok: false; error: PlanError };

const fail = (error: PlanError): PlanResult => ({ ok: false, error });
const storage = (error: Error): PlanResult => fail({ kind: 'storage', error });

/** The season's plan, or null when none is saved. Fails closed on an unreadable document. */
export async function getOffseasonPlan(db: Database, seasonId: string): Promise<Result<OffseasonPlan | null>> {
  const stored = await db.get<unknown>(OFFSEASON_PLAN_COLLECTION, seasonId);
  if (!stored.ok) return stored;
  if (stored.value === null) return ok(null);
  if (isOffseasonPlan(stored.value) && stored.value.seasonId === seasonId) return ok(stored.value);
  return failResult(new Error(`Saved offseason plan ${seasonId} could not be read`));
}

/** Saves which teams leave the league while the season is in `offseason`; live teams and rosters are not touched. */
export const saveOffseasonPlan = (db: Database, league: League, promoted: string[], demoted: string[]) =>
  acceptQueue(() => saveNow(db, league, promoted, demoted));

async function saveNow(db: Database, league: League, promoted: string[], demoted: string[]): Promise<PlanResult> {
  const found = await getLeagueSeason(db, league.id);
  if (!found.ok) return storage(found.error);
  const season = found.value;
  if (season === null) return fail({ kind: 'no-season' });
  if (season.status !== 'offseason') return fail({ kind: 'not-offseason' });

  const archive = await getSeasonArchive(db, season.id);
  if (!archive.ok) return storage(archive.error);
  if (archive.value === null) return fail({ kind: 'no-archive' });

  const checked = validateDepartures({ archive: archive.value, league, promoted, demoted });
  if (!checked.ok) return fail({ kind: checked.error });

  const existing = await getOffseasonPlan(db, season.id);
  if (!existing.ok) return storage(existing.error);
  const plan: OffseasonPlan = {
    ...(existing.value?.arrivals ? { arrivals: existing.value.arrivals } : {}),
    ...(existing.value?.newTeams ? { newTeams: existing.value.newTeams } : {}),
    seasonId: season.id,
    leagueId: league.id,
    promoted: [...promoted],
    demoted: [...demoted],
  };
  const written = await db.batch([{ type: 'put', collection: OFFSEASON_PLAN_COLLECTION, id: season.id, value: plan }]);
  return written.ok ? { ok: true, value: plan } : storage(written.error);
}

type Loaded<T> = { ok: true; value: T } | { ok: false; error: Error };

/** Every league, this league's current record, and the leagues directly above and below it. Fails closed on an unreadable league. */
async function resolveNeighbors(
  db: Database,
  league: League,
): Promise<Loaded<{ leagues: League[]; current: League; above: League | null; below: League | null }>> {
  const all = await listLeagues(db);
  if (!all.ok) return { ok: false, error: all.error.kind === 'storage' ? all.error.error : new Error('Could not read leagues') };
  if (all.value.unreadable > 0) return { ok: false, error: new Error('A saved league could not be read') };
  const leagues = all.value.leagues;
  const current = leagues.find((l) => l.id === league.id) ?? league;
  return { ok: true, value: { leagues, current, above: leagueAbove(current, leagues), below: leagueBelow(current, leagues) } };
}

/** The linked leagues next to `league`, each with its season results and plan, and the ones that cannot send teams yet. */
async function loadSources(
  db: Database,
  league: League,
): Promise<Loaded<{ sources: ArrivalSource[]; blocked: BlockedNeighbor[]; hasAbove: boolean; hasBelow: boolean }>> {
  const resolved = await resolveNeighbors(db, league);
  if (!resolved.ok) return resolved;
  const neighbors = [
    { direction: 'above' as const, league: resolved.value.above },
    { direction: 'below' as const, league: resolved.value.below },
  ];
  const sources: ArrivalSource[] = [];
  const blocked: BlockedNeighbor[] = [];
  for (const { direction, league: other } of neighbors) {
    if (other === null) continue;
    const block = (reason: BlockedReason) => blocked.push({ leagueId: other.id, leagueName: other.name, direction, reason });
    const season = await getLeagueSeason(db, other.id);
    if (!season.ok) return season;
    if (season.value === null) {
      block('no-season');
      continue;
    }
    if (season.value.status !== 'offseason') {
      block('not-offseason');
      continue;
    }
    const archive = await getSeasonArchive(db, season.value.id);
    if (!archive.ok) return archive;
    if (archive.value === null) {
      block('no-archive');
      continue;
    }
    const plan = await getOffseasonPlan(db, season.value.id);
    if (!plan.ok) return plan;
    if (plan.value === null) block('no-plan');
    sources.push({ league: other, direction, archive: archive.value, plan: plan.value });
  }
  return { ok: true, value: { sources, blocked, hasAbove: neighbors[0].league !== null, hasBelow: neighbors[1].league !== null } };
}

export interface ArrivalStatus {
  /** Whether a linked league sits above or below this one. */
  hasAbove: boolean;
  hasBelow: boolean;
  sources: ArrivalSource[];
  blocked: BlockedNeighbor[];
  expected: ExpectedArrival[];
  /** The arrivals saved in this league's plan, or null when none were staged (or there is no plan yet). */
  staged: StagedArrival[] | null;
  /** True when `staged` matches what the linked leagues' plans send now. */
  current: boolean;
}

export type ArrivalStatusResult = Result<ArrivalStatus>;

/** Who should arrive here, who is staged, and what blocks staging. Fails closed on unreadable data. */
export async function getArrivalStatus(db: Database, league: League): Promise<ArrivalStatusResult> {
  const loaded = await loadSources(db, league);
  if (!loaded.ok) return failResult(loaded.error);
  const found = await getLeagueSeason(db, league.id);
  if (!found.ok) return found;
  let staged: StagedArrival[] | null = null;
  if (found.value !== null) {
    const plan = await getOffseasonPlan(db, found.value.id);
    if (!plan.ok) return plan;
    staged = plan.value?.arrivals ?? null;
  }
  const expected = expectedArrivals(loaded.value.sources);
  return ok({ ...loaded.value, expected, staged, current: staged !== null && arrivalsAreCurrent(staged, expected) });
}

/** Stages (or restages, rerolling control stars) the teams arriving from linked leagues into this league's plan. */
export const stageArrivals = (db: Database, league: League, rng: Rng = Math.random) =>
  acceptQueue(() => stageNow(db, league, rng));

async function stageNow(db: Database, league: League, rng: Rng): Promise<PlanResult> {
  const found = await getLeagueSeason(db, league.id);
  if (!found.ok) return storage(found.error);
  const season = found.value;
  if (season === null) return fail({ kind: 'no-season' });
  if (season.status !== 'offseason') return fail({ kind: 'not-offseason' });
  const own = await getOffseasonPlan(db, season.id);
  if (!own.ok) return storage(own.error);
  if (own.value === null) return fail({ kind: 'no-plan' });

  const loaded = await loadSources(db, league);
  if (!loaded.ok) return storage(loaded.error);
  if (loaded.value.blocked.length > 0) return fail({ kind: 'blocked', blocked: loaded.value.blocked });

  const built = buildArrivals(expectedArrivals(loaded.value.sources), loaded.value.sources, rng);
  if (!built.ok) return fail({ kind: 'missing-team', franchiseId: built.franchiseId });

  // Saved protections and free agency picks depend on who participates and on the adjusted ratings, so they are dropped.
  const { seasonId, leagueId, promoted, demoted, newTeams } = own.value;
  const plan: OffseasonPlan = { seasonId, leagueId, promoted, demoted, arrivals: built.value, ...(newTeams ? { newTeams } : {}) };
  const written = await db.batch([{ type: 'put', collection: OFFSEASON_PLAN_COLLECTION, id: season.id, value: plan }]);
  return written.ok ? { ok: true, value: plan } : storage(written.error);
}

export interface NewTeamOptions {
  rng?: Rng;
  newId?: () => string;
  pool?: readonly string[];
}

export type NewTeamInput = Pick<StagedNewTeam, 'city' | 'name' | 'primaryColor' | 'secondaryColor'>;

const DUPLICATE_NAME = 'A team with this name already exists in this league or a linked league.';

const norm = (name: string) => name.trim().toLowerCase();

interface StagedNames {
  teams: { leagueId: string; team: StagedNewTeam }[];
  /** Names of staged players in every plan other than the new teams' own rosters: draftees and progression replacements. */
  draftees: string[];
}

/** Every staged new team and draftee name in every offseason plan, or a read failure. Fails closed on an unreadable plan. */
async function listStagedNewTeams(db: Database): Promise<Loaded<StagedNames>> {
  const stored = await db.list<unknown>(OFFSEASON_PLAN_COLLECTION);
  if (!stored.ok) return { ok: false, error: stored.error };
  const out: StagedNames = { teams: [], draftees: [] };
  for (const { id, value } of stored.value) {
    if (!isOffseasonPlan(value) || value.seasonId !== id) return { ok: false, error: new Error(`Saved offseason plan ${id} could not be read`) };
    for (const team of value.newTeams ?? []) out.teams.push({ leagueId: value.leagueId, team });
    out.draftees.push(...stagedPlayerNames({ ...value, newTeams: undefined }));
  }
  return { ok: true, value: out };
}

interface NewTeamContext {
  ok: true;
  season: Season;
  plan: OffseasonPlan;
  links: { hasAbove: boolean; hasBelow: boolean };
  chain: string[];
  staged: StagedNames;
}

/** The pieces every new-team edit needs: the offseason season, this league's plan, and what its links leave open. */
type PlanFailure = { ok: false; error: PlanError };

async function loadForNewTeams(db: Database, league: League): Promise<PlanFailure | NewTeamContext> {
  const fail = (error: PlanError): PlanFailure => ({ ok: false, error });
  const storage = (error: Error): PlanFailure => fail({ kind: 'storage', error });
  const found = await getLeagueSeason(db, league.id);
  if (!found.ok) return storage(found.error);
  const season = found.value;
  if (season === null) return fail({ kind: 'no-season' });
  if (season.status !== 'offseason') return fail({ kind: 'not-offseason' });
  const own = await getOffseasonPlan(db, season.id);
  if (!own.ok) return storage(own.error);
  if (own.value === null) return fail({ kind: 'no-plan' });
  const resolved = await resolveNeighbors(db, league);
  if (!resolved.ok) return storage(resolved.error);
  const { leagues, current, above, below } = resolved.value;
  const links = { hasAbove: above !== null, hasBelow: below !== null };
  const staged = await listStagedNewTeams(db);
  if (!staged.ok) return storage(staged.error);
  return { ok: true, season, plan: own.value, links, chain: chainLeagueIds(current, leagues), staged: staged.value };
}

/** Names a new roster may not use: burned, on another staged new team, or on a staged draftee. */
async function unavailablePlayerNames(db: Database, staged: StagedNames, except?: string) {
  const burned = await getBurnedNames(db);
  if (!burned.ok) return burned;
  const names = new Set(burned.value);
  for (const { team } of staged.teams) if (team.id !== except) for (const p of team.players) names.add(p.name);
  for (const name of staged.draftees) names.add(name);
  return ok(names);
}

async function writeNewTeams(db: Database, plan: OffseasonPlan, newTeams: StagedNewTeam[]): Promise<PlanResult> {
  const next: OffseasonPlan = { ...plan, newTeams };
  const written = await db.batch([{ type: 'put', collection: OFFSEASON_PLAN_COLLECTION, id: plan.seasonId, value: next }]);
  return written.ok ? { ok: true, value: next } : storage(written.error);
}

/** Runs a team build, turning name-pool exhaustion into `no-names`; anything else is unexpected and propagates. */
function buildOrNoNames(make: () => StagedNewTeam): { ok: true; team: StagedNewTeam } | { ok: false; error: PlanError } {
  try {
    return { ok: true, team: make() };
  } catch (e) {
    if (e instanceof NamesExhaustedError) return { ok: false, error: { kind: 'no-names' } };
    throw e;
  }
}

/** Stages a newly created team for a place the links leave open: rolls its grade and generates its roster. */
export const addNewTeam = (db: Database, league: League, input: NewTeamInput, vacancy: StagedNewTeam['vacancy'], options: NewTeamOptions = {}) =>
  acceptQueue(() => addNow(db, league, input, vacancy, options));

async function addNow(db: Database, league: League, input: NewTeamInput, vacancy: StagedNewTeam['vacancy'], options: NewTeamOptions): Promise<PlanResult> {
  const { rng = Math.random, newId = createId, pool = NAME_POOL } = options;
  const loaded = await loadForNewTeams(db, league);
  if (!loaded.ok) return loaded;
  const checked = validateIdentityInput(input);
  if (!checked.ok) return fail({ kind: 'validation', fields: checked.fields });
  if (openVacancies(loaded.plan, loaded.links)[vacancy] <= 0) return fail({ kind: 'no-vacancy' });

  const franchises = await db.list<unknown>(FRANCHISE_COLLECTION);
  if (!franchises.ok) return storage(franchises.error);
  const wanted = norm(checked.value.name);
  const usedByTeam = franchises.value.some(({ value }) => {
    if (!isFranchise(value) || !loaded.chain.includes(value.leagueId)) return false;
    const identity = identityForSeason(value, loaded.season.index) ?? value.identities[0];
    return norm(identity.name) === wanted;
  });
  const usedByStaged = loaded.staged.teams.some(({ leagueId, team }) => loaded.chain.includes(leagueId) && norm(team.name) === wanted);
  if (usedByTeam || usedByStaged) return fail({ kind: 'validation', fields: { name: DUPLICATE_NAME } });

  const unavailable = await unavailablePlayerNames(db, loaded.staged);
  if (!unavailable.ok) return storage(unavailable.error);
  const pickName = namePicker(unavailable.value, rng, pool);
  const made = buildOrNoNames(() => buildNewTeam({ id: newId(), vacancy, identity: checked.value, leagueId: league.id, rng, pickName }));
  if (!made.ok) return fail(made.error);
  return writeNewTeams(db, loaded.plan, [...(loaded.plan.newTeams ?? []), made.team]);
}

/** Redoes the grade roll and roster of a staged new team; its id, side and identity stay. */
export const rerollNewTeam = (db: Database, league: League, teamId: string, options: NewTeamOptions = {}) =>
  acceptQueue(() => rerollNow(db, league, teamId, options));

async function rerollNow(db: Database, league: League, teamId: string, options: NewTeamOptions): Promise<PlanResult> {
  const { rng = Math.random, pool = NAME_POOL } = options;
  const loaded = await loadForNewTeams(db, league);
  if (!loaded.ok) return loaded;
  const teams = loaded.plan.newTeams ?? [];
  const index = teams.findIndex((t) => t.id === teamId);
  if (index < 0) return fail({ kind: 'not-found' });
  const unavailable = await unavailablePlayerNames(db, loaded.staged, teamId);
  if (!unavailable.ok) return storage(unavailable.error);
  const pickName = namePicker(unavailable.value, rng, pool);
  const old = teams[index];
  const { city, name, primaryColor, secondaryColor } = old;
  const made = buildOrNoNames(() =>
    buildNewTeam({ id: old.id, vacancy: old.vacancy, identity: { city, name, primaryColor, secondaryColor }, leagueId: league.id, rng, pickName }),
  );
  if (!made.ok) return fail(made.error);
  return writeNewTeams(db, loaded.plan, teams.map((t, i) => (i === index ? made.team : t)));
}

/** Removes a staged new team, freeing its place. */
export const removeNewTeam = (db: Database, league: League, teamId: string) => acceptQueue(() => removeNow(db, league, teamId));

async function removeNow(db: Database, league: League, teamId: string): Promise<PlanResult> {
  const loaded = await loadForNewTeams(db, league);
  if (!loaded.ok) return loaded;
  const teams = loaded.plan.newTeams ?? [];
  if (!teams.some((t) => t.id === teamId)) return fail({ kind: 'not-found' });
  return writeNewTeams(db, loaded.plan, teams.filter((t) => t.id !== teamId));
}

export function blockedText(blocked: BlockedNeighbor): string {
  const where = blocked.direction === 'above' ? 'above' : 'below';
  switch (blocked.reason) {
    case 'no-season':
      return `${blocked.leagueName} (${where}) has not been accepted yet.`;
    case 'not-offseason':
      return `${blocked.leagueName} (${where}) has not ended its season yet.`;
    case 'no-archive':
      return `The saved season results for ${blocked.leagueName} (${where}) could not be found.`;
    case 'no-plan':
      return `${blocked.leagueName} (${where}) has not saved its plan yet.`;
  }
}

export function planErrorText(error: PlanError, league: League): string {
  switch (error.kind) {
    case 'no-plan':
      return 'Save this league\'s plan first.';
    case 'validation':
      return Object.values(error.fields).join(' ');
    case 'no-vacancy':
      return 'There is no open place for a new team on that side.';
    case 'not-found':
      return 'That new team no longer exists.';
    case 'no-names':
      return 'No unused last names are left.';
    case 'arrivals-not-ready':
      return 'Stage the arrivals from the linked leagues first, or restage them if they are out of date.';
    case 'unknown-player':
      return 'That player is not on a team taking part in the offseason.';
    case 'protection-incomplete':
      return 'Protect one player on every team first.';
    case 'aging-not-run':
      return 'Run aging, retirement and release first.';
    case 'draft-complete':
      return 'Every team has already picked.';
    case 'not-in-pool':
      return 'That player is not available in free agency.';
    case 'no-picks':
      return 'There is no pick to undo.';
    case 'free-agency-incomplete':
      return 'Finish the free agency draft first.';
    case 'pool-not-generated':
      return 'Generate the draft pool first.';
    case 'picks-exist':
      return 'Undo the rookie picks before regenerating the draft pool.';
    case 'rookie-draft-incomplete':
      return 'Finish the rookie draft first.';
    case 'kind-not-needed':
      return 'That team does not need that kind of player.';
    case 'blocked':
      return error.blocked.map(blockedText).join(' ');
    case 'missing-team':
      return 'A team from the linked league could not be found in its saved results.';
    case 'no-season':
      return 'This league has not been accepted yet.';
    case 'not-offseason':
      return 'The offseason plan can only be changed while the season is in the offseason.';
    case 'no-archive':
      return 'The saved season results could not be found.';
    case 'storage':
      return error.error.message;
    default:
      return departureErrorText(error.kind, league);
  }
}
