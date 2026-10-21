import type { OffseasonPlan } from './offseason-plan';
import type { ArrivalStatus } from './offseason-plan-repository';
import { arrivalsReady, type ParticipatingTeam } from './roster-changes';

export const WIZARD_STEPS = ['order', 'departures', 'arrivals', 'new-teams', 'protection', 'aging'] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export const STEP_INFO: Record<WizardStep, { title: string; instruction: string }> = {
  order: { title: 'Finishing order', instruction: 'Check the final finishing order of the season. Correct it here if it is wrong.' },
  departures: { title: 'Departures', instruction: 'Choose which teams are promoted and demoted out of this league, then save the plan.' },
  arrivals: { title: 'Arrivals', instruction: 'Bring in the teams moving here from the linked leagues. Their ratings are adjusted when staged.' },
  'new-teams': { title: 'New teams', instruction: 'Fill any places the linked leagues do not fill with newly created teams.' },
  protection: { title: 'Protection', instruction: 'Protect one player on each team. A protected player cannot retire or be released.' },
  aging: { title: 'Aging, retirement and release', instruction: 'Age every player a year, retire the oldest unprotected player on each team and release one more at random.' },
};

export type StepStatus = 'complete' | 'incomplete';
export type StepStatuses = Record<WizardStep, StepStatus>;

export interface WizardInput {
  plan: OffseasonPlan | null;
  teams: readonly ParticipatingTeam[];
  arrivals: Pick<ArrivalStatus, 'expected' | 'staged' | 'current' | 'blocked'>;
}

/** Steps that never stop the commissioner from moving on. */
const NEVER_BLOCKS: readonly WizardStep[] = ['order', 'new-teams'];

export function isWizardStep(value: unknown): value is WizardStep {
  return typeof value === 'string' && (WIZARD_STEPS as readonly string[]).includes(value);
}

const status = (done: boolean): StepStatus => (done ? 'complete' : 'incomplete');

export function stepStatuses({ plan, teams, arrivals }: WizardInput): StepStatuses {
  const changes = plan?.teamChanges ?? [];
  const protectedAll = teams.length > 0 && teams.every((t) => changes.some((c) => c.franchiseId === t.franchiseId));
  const aged = protectedAll && teams.every((t) => changes.some((c) => c.franchiseId === t.franchiseId && c.retiredId !== undefined));
  return {
    order: 'complete',
    departures: status(plan !== null),
    arrivals: status(plan !== null && arrivalsReady(arrivals)),
    'new-teams': status(plan !== null),
    protection: status(protectedAll),
    aging: status(aged),
  };
}

export function firstIncompleteStep(statuses: StepStatuses): WizardStep | null {
  return WIZARD_STEPS.find((s) => statuses[s] === 'incomplete' && !NEVER_BLOCKS.includes(s)) ?? null;
}

/** A step can be opened when every blocking step before it is complete. */
export function canOpenStep(step: WizardStep, statuses: StepStatuses): boolean {
  const index = WIZARD_STEPS.indexOf(step);
  return WIZARD_STEPS.slice(0, index).every((s) => NEVER_BLOCKS.includes(s) || statuses[s] === 'complete');
}

export const previousStep = (step: WizardStep): WizardStep | null => WIZARD_STEPS[WIZARD_STEPS.indexOf(step) - 1] ?? null;
export const nextStep = (step: WizardStep): WizardStep | null => WIZARD_STEPS[WIZARD_STEPS.indexOf(step) + 1] ?? null;

/** True when Next must stay disabled on this step. */
export function nextBlocked(step: WizardStep, statuses: StepStatuses): boolean {
  return statuses[step] === 'incomplete' && !NEVER_BLOCKS.includes(step);
}
