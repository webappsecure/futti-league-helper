import { GRADES, type Grade } from '@/rules/charts';
import type { NamingStyle } from '@/leagues/league';

export const TEAM_TEXT_MAX_LENGTH = 60;

export const PALETTE = [
  '#d92d20',
  '#f97316',
  '#facc15',
  '#16a34a',
  '#0d9488',
  '#3c87f7',
  '#1e3a8a',
  '#7c3aed',
  '#db2777',
  '#78350f',
  '#6b7280',
  '#000000',
] as const;

export interface FranchiseIdentity {
  fromSeason: number;
  city: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
}

export interface Franchise {
  id: string;
  leagueId: string;
  initialGrade: Grade;
  identities: FranchiseIdentity[];
}

/** Raw form values; grade is null until chosen. */
export interface FranchiseInput {
  city: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  initialGrade: string | null;
}

export type FranchiseFields = 'city' | 'name' | 'primaryColor' | 'secondaryColor' | 'initialGrade';
export type FranchiseFieldErrors = Partial<Record<FranchiseFields, string>>;

export type FranchiseValidation =
  | { ok: true; value: { initialGrade: Grade; identity: FranchiseIdentity } }
  | { ok: false; fields: FranchiseFieldErrors };

/** Returns lowercase `#rrggbb` for `#rgb` or `#rrggbb` (the `#` is optional), otherwise null. */
export function normalizeHexColor(text: string): string | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text.trim());
  if (!match) return null;
  const digits = match[1].toLowerCase();
  const full = digits.length === 3 ? [...digits].map((c) => c + c).join('') : digits;
  return `#${full}`;
}

function textError(value: string, label: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) return `Enter a ${label}.`;
  if (trimmed.length > TEAM_TEXT_MAX_LENGTH) return `Use ${TEAM_TEXT_MAX_LENGTH} characters or fewer.`;
  return undefined;
}

export type IdentityFieldErrors = Partial<Record<'city' | 'name' | 'primaryColor' | 'secondaryColor', string>>;

export type IdentityValidation =
  | { ok: true; value: Omit<FranchiseIdentity, 'fromSeason'> }
  | { ok: false; fields: IdentityFieldErrors };

/** Checks and cleans a team's city, name and colors: trimmed text and lowercase `#rrggbb`. */
export function validateIdentityInput(
  input: Pick<FranchiseInput, 'city' | 'name' | 'primaryColor' | 'secondaryColor'>,
): IdentityValidation {
  const fields: IdentityFieldErrors = {};
  const cityError = textError(input.city, 'city');
  if (cityError) fields.city = cityError;
  const nameError = textError(input.name, 'team name');
  if (nameError) fields.name = nameError;

  const primary = normalizeHexColor(input.primaryColor);
  if (primary === null) fields.primaryColor = 'Choose a color or enter a hex value like #3c87f7.';
  const secondary = normalizeHexColor(input.secondaryColor);
  if (secondary === null) fields.secondaryColor = 'Choose a color or enter a hex value like #3c87f7.';

  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return {
    ok: true,
    value: {
      city: input.city.trim(),
      name: input.name.trim(),
      primaryColor: primary as string,
      secondaryColor: secondary as string,
    },
  };
}

export function validateFranchiseInput(input: FranchiseInput): FranchiseValidation {
  const identity = validateIdentityInput(input);
  const fields: FranchiseFieldErrors = identity.ok ? {} : { ...identity.fields };

  const grade = GRADES.find((g) => g === input.initialGrade);
  if (grade === undefined) fields.initialGrade = 'Choose an initial grade.';

  if (Object.keys(fields).length > 0 || !identity.ok) return { ok: false, fields };
  return {
    ok: true,
    value: { initialGrade: grade as Grade, identity: { fromSeason: 1, ...identity.value } },
  };
}

/** The identity in effect for a season: the greatest `fromSeason` not above it. */
export function identityForSeason(franchise: Franchise, season: number): FranchiseIdentity | null {
  let best: FranchiseIdentity | null = null;
  for (const identity of franchise.identities) {
    if (identity.fromSeason <= season && (best === null || identity.fromSeason > best.fromSeason)) {
      best = identity;
    }
  }
  return best;
}

export function displayName(identity: FranchiseIdentity, namingStyle: NamingStyle): string {
  return namingStyle === 'cityAndName' ? `${identity.city} ${identity.name}` : identity.name;
}

function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

/** Finds another team in the list with the same team name, ignoring case and outer spaces. */
export function findDuplicateName(
  teams: Franchise[],
  name: string,
  exceptId?: string,
): Franchise | null {
  const key = nameKey(name);
  return (
    teams.find((team) => {
      if (team.id === exceptId) return false;
      const identity = identityForSeason(team, 1);
      return identity !== null && nameKey(identity.name) === key;
    }) ?? null
  );
}

export function isFranchise(value: unknown): value is Franchise {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || v.id.length === 0) return false;
  if (typeof v.leagueId !== 'string' || v.leagueId.length === 0) return false;
  if (!GRADES.includes(v.initialGrade as Grade)) return false;
  if (!Array.isArray(v.identities) || v.identities.length === 0) return false;
  return v.identities.every((entry) => {
    if (typeof entry !== 'object' || entry === null) return false;
    const e = entry as Record<string, unknown>;
    return (
      typeof e.fromSeason === 'number' &&
      Number.isInteger(e.fromSeason) &&
      e.fromSeason >= 1 &&
      typeof e.city === 'string' &&
      e.city.trim().length > 0 &&
      typeof e.name === 'string' &&
      e.name.trim().length > 0 &&
      typeof e.primaryColor === 'string' &&
      normalizeHexColor(e.primaryColor) === e.primaryColor &&
      typeof e.secondaryColor === 'string' &&
      normalizeHexColor(e.secondaryColor) === e.secondaryColor
    );
  });
}
