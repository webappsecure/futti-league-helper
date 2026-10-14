export const SEASON_COLLECTION = 'seasons';

export const SEASON_STATUSES = ['setup', 'active', 'offseason', 'archived'] as const;
export type SeasonStatus = (typeof SEASON_STATUSES)[number];

export interface Season {
  id: string;
  leagueId: string;
  /** 1 for the first season; later seasons increment. */
  index: number;
  status: SeasonStatus;
}

export function isSeason(value: unknown): value is Season {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    v.id.length > 0 &&
    typeof v.leagueId === 'string' &&
    v.leagueId.length > 0 &&
    typeof v.index === 'number' &&
    Number.isInteger(v.index) &&
    v.index >= 1 &&
    SEASON_STATUSES.includes(v.status as SeasonStatus)
  );
}

export const LOCKED_TEXT = 'This league has been accepted. Its teams and rosters are locked.';
