import { useCallback, useRef, useState } from 'react';

import type { League } from '@/leagues/league';
import { listRosters } from '@/rosters/roster-repository';
import type { Season } from '@/seasons/season';
import { useDatabase } from '@/storage/storage-provider';
import { listFranchises } from '@/teams/franchise-repository';
import { buildCardSheets } from './build-card-sheets';
import { loadCardAssets } from './load-card-assets';
import { printHtml } from './print-cards';

/** Prints the league's cards for its accepted season; one print runs at a time. */
export function usePrintCards(league: League, season: Season | null) {
  const db = useDatabase();
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);

  const print = useCallback(async () => {
    if (season === null || running.current) return;
    running.current = true;
    setPrinting(true);
    setError(null);
    try {
      setError(await run());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      running.current = false;
      setPrinting(false);
    }

    /** Returns the message to show, or null on success. */
    async function run(): Promise<string | null> {
      const teams = await listFranchises(db, league);
      if (!teams.ok) return teams.error.kind === 'storage' ? teams.error.error.message : 'Could not read teams.';
      const rosters = await listRosters(db, league);
      if (!rosters.ok) return rosters.error.kind === 'storage' ? rosters.error.error.message : 'Could not read rosters.';
      if (teams.value.unreadable > 0 || rosters.value.unreadable > 0) {
        return 'Some saved teams or rosters could not be read, so the cards were not printed.';
      }
      const assets = await loadCardAssets();
      if (!assets.ok) return assets.error.message;
      const sheets = buildCardSheets({
        league,
        seasonIndex: season!.index,
        franchises: teams.value.teams,
        rosters: rosters.value.rosters,
        images: assets.value.images,
        font: assets.value.font,
        pillFont: assets.value.pillFont,
      });
      if (!sheets.ok) return sheets.message;
      const printed = await printHtml(sheets.html);
      return printed.ok ? null : printed.error.message;
    }
  }, [db, league, season]);

  return { print, printing, error };
}
