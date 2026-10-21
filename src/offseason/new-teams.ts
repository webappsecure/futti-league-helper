import type { FranchiseIdentity } from '@/teams/franchise';
import type { Rng } from '@/rules/dice';
import { rollDie } from '@/rules/dice';
import { generateRoster, type PickName } from '@/rosters/roster';
import type { OffseasonPlan, StagedNewTeam } from './offseason-plan';
import { replacementGrade } from './rating-adjust';

/** Which sides have a linked league that fills the places through arrivals. */
export interface VacancyLinks {
  hasAbove: boolean;
  hasBelow: boolean;
}

export interface Vacancies {
  /** Places left by promoted teams. A league above fills them with its demoted teams. */
  promoted: number;
  /** Places left by demoted teams. A league below fills them with its promoted teams. */
  demoted: number;
}

/** The places linked leagues never fill: a side with no linked league leaves all its departing teams' places open. */
function capacity(plan: Pick<OffseasonPlan, 'promoted' | 'demoted'>, { hasAbove, hasBelow }: VacancyLinks): Vacancies {
  return { promoted: hasAbove ? 0 : plan.promoted.length, demoted: hasBelow ? 0 : plan.demoted.length };
}

const countSide = (teams: readonly StagedNewTeam[], side: StagedNewTeam['vacancy']) => teams.filter((t) => t.vacancy === side).length;

/** Places still open for new teams after the ones already staged. */
export function openVacancies(plan: OffseasonPlan, links: VacancyLinks): Vacancies {
  const total = capacity(plan, links);
  const staged = plan.newTeams ?? [];
  return {
    promoted: Math.max(0, total.promoted - countSide(staged, 'promoted')),
    demoted: Math.max(0, total.demoted - countSide(staged, 'demoted')),
  };
}

/** True when the staged new teams do not take more places than the links leave open. */
export function newTeamsFit(plan: OffseasonPlan, links: VacancyLinks): boolean {
  const total = capacity(plan, links);
  const staged = plan.newTeams ?? [];
  return countSide(staged, 'promoted') <= total.promoted && countSide(staged, 'demoted') <= total.demoted;
}

/** Rolls the replacement grade for the vacancy and generates the roster from it. */
export function buildNewTeam(input: {
  id: string;
  vacancy: StagedNewTeam['vacancy'];
  identity: Omit<FranchiseIdentity, 'fromSeason'>;
  leagueId: string;
  rng: Rng;
  pickName: PickName;
}): StagedNewTeam {
  const { id, vacancy, identity, leagueId, rng, pickName } = input;
  const gradeRoll = rollDie(rng);
  const grade = replacementGrade(vacancy, gradeRoll);
  const roster = generateRoster(id, leagueId, grade, rng, pickName);
  return { id, vacancy, gradeRoll, grade, ...identity, players: roster.players };
}
