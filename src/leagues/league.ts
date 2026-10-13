import { createId } from './ids';

export const LEAGUE_SIZES = [6, 8, 10, 12, 14, 16, 18, 20] as const;
export type LeagueSize = (typeof LEAGUE_SIZES)[number];

export const NAMING_STYLES = ['cityAndName', 'nameOnly'] as const;
export type NamingStyle = (typeof NAMING_STYLES)[number];

export const NAME_MAX_LENGTH = 60;
export const LEAGUE_COLLECTION = 'leagues';

export interface League {
  id: string;
  name: string;
  size: LeagueSize;
  namingStyle: NamingStyle;
  relegation: boolean;
  promotedCount: number;
  demotedCount: number;
  /** Set on both sides of a link; omitted when unlinked. */
  leagueAboveId?: string;
  leagueBelowId?: string;
}

/** Raw form values; size and naming style are null until chosen. */
export interface LeagueInput {
  name: string;
  size: number | null;
  namingStyle: NamingStyle | null;
  relegation: boolean;
  promotedCount: number;
  demotedCount: number;
}

export type LeagueFields = 'name' | 'size' | 'namingStyle' | 'promotedCount' | 'demotedCount' | 'counts';
export type FieldErrors = Partial<Record<LeagueFields, string>>;

export type LeagueValidation =
  | { ok: true; value: Omit<League, 'id'> }
  | { ok: false; fields: FieldErrors };

function isLeagueSize(size: number | null): size is LeagueSize {
  return LEAGUE_SIZES.includes(size as LeagueSize);
}

function isWholeCount(count: number): boolean {
  return Number.isInteger(count) && count >= 0;
}

export function validateLeagueInput(input: LeagueInput): LeagueValidation {
  const fields: FieldErrors = {};

  const name = input.name.trim();
  if (name.length === 0) fields.name = 'Enter a league name.';
  else if (name.length > NAME_MAX_LENGTH) {
    fields.name = `Use ${NAME_MAX_LENGTH} characters or fewer.`;
  }

  if (!isLeagueSize(input.size)) fields.size = 'Choose a league size.';
  if (input.namingStyle === null || !NAMING_STYLES.includes(input.namingStyle)) {
    fields.namingStyle = 'Choose how team names are shown.';
  }

  let promotedCount = 0;
  let demotedCount = 0;
  if (input.relegation) {
    const max = isLeagueSize(input.size) ? input.size : null;
    const countError = (count: number) => {
      if (!isWholeCount(count)) return 'Enter a whole number, 0 or more.';
      if (max !== null && count > max) return `Use ${max} or fewer.`;
      return undefined;
    };
    const promotedError = countError(input.promotedCount);
    const demotedError = countError(input.demotedCount);
    if (promotedError) fields.promotedCount = promotedError;
    if (demotedError) fields.demotedCount = demotedError;
    if (!promotedError && !demotedError && input.promotedCount + input.demotedCount < 1) {
      fields.counts = 'A relegation league must promote or demote at least one team.';
    }
    promotedCount = input.promotedCount;
    demotedCount = input.demotedCount;
  }

  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return {
    ok: true,
    value: {
      name,
      size: input.size as LeagueSize,
      namingStyle: input.namingStyle as NamingStyle,
      relegation: input.relegation,
      promotedCount,
      demotedCount,
    },
  };
}

/** Empty text counts as 0; anything that is not whole digits becomes NaN so validation rejects it. */
export function parseCount(text: string): number {
  const trimmed = text.trim();
  if (trimmed === '') return 0;
  return /^\d+$/.test(trimmed) ? Number(trimmed) : NaN;
}

export const createLeagueId = createId;

/** True when a stored document has the shape and values of a saved league. */
export function isLeague(value: unknown): value is League {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || v.id.length === 0) return false;
  if (typeof v.name !== 'string' || typeof v.relegation !== 'boolean') return false;
  if (typeof v.size !== 'number' || typeof v.promotedCount !== 'number') return false;
  if (typeof v.demotedCount !== 'number') return false;
  if (typeof v.namingStyle !== 'string') return false;
  for (const link of [v.leagueAboveId, v.leagueBelowId]) {
    if (link !== undefined && (typeof link !== 'string' || link.length === 0)) return false;
  }
  const result = validateLeagueInput({
    name: v.name,
    size: v.size,
    namingStyle: v.namingStyle as NamingStyle,
    relegation: v.relegation,
    promotedCount: v.promotedCount,
    demotedCount: v.demotedCount,
  });
  return result.ok && result.value.name === v.name;
}
