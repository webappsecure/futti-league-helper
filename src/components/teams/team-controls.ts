export interface TeamControlInputs {
  /** The league has a season. */
  accepted: boolean;
  /** The season lookup finished, so `accepted` can be trusted. */
  seasonKnown: boolean;
  teamsReady: boolean;
  rostersReady: boolean;
  /** A roster write is in flight. */
  busy: boolean;
  teamCount: number;
  size: number;
  rosterCount: number;
  missingRosters: number;
}

export interface TeamControls {
  /** Team and roster actions are shown at all; false once accepted. */
  showActions: boolean;
  addEnabled: boolean;
  full: boolean;
  generateEnabled: boolean;
  rerollAllEnabled: boolean;
  reviewEnabled: boolean;
}

/** Which league-level team controls are shown and enabled. Nothing is enabled until the season is known. */
export function teamControls(i: TeamControlInputs): TeamControls {
  const ready = i.rostersReady && i.seasonKnown && !i.busy;
  const full = i.teamCount >= i.size;
  return {
    showActions: !i.accepted,
    addEnabled: i.teamsReady && i.seasonKnown && !full,
    full,
    generateEnabled: ready && i.missingRosters > 0,
    rerollAllEnabled: ready && i.rosterCount > 0,
    reviewEnabled: ready && i.teamCount > 0,
  };
}
