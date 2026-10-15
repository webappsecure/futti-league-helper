import { useCallback, useRef, useState } from 'react';

import type { League } from '@/leagues/league';
import { listRosters } from '@/rosters/roster-repository';
import type { Season } from '@/seasons/season';
import { useDatabase } from '@/storage/storage-provider';
import { listFranchises } from '@/teams/franchise-repository';
import { buildCardSheets } from './build-card-sheets';
import { loadCardAssets } from './load-card-assets';
import { pdfFileName } from './pdf-file-name';
import { printHtml } from './print-cards';
import { savePdf } from './save-cards-pdf';

export type CardsAction = 'print' | 'pdf';

/** Prints or saves as PDF the league's cards for its accepted season; one action runs at a time. */
export function usePrintCards(league: League, season: Season | null) {
  const db = useDatabase();
  const [active, setActive] = useState<CardsAction | null>(null);
  const [error, setError] = useState<{ action: CardsAction; message: string } | null>(null);
  const running = useRef(false);

  const start = useCallback(async (action: CardsAction) => {
    if (season === null || running.current) return;
    running.current = true;
    setActive(action);
    setError(null);
    try {
      const message = await run();
      setError(message === null ? null : { action, message });
    } catch (e) {
      setError({ action, message: e instanceof Error ? e.message : String(e) });
    } finally {
      running.current = false;
      setActive(null);
    }

    /** Returns the message to show, or null on success. */
    async function run(): Promise<string | null> {
      const teams = await listFranchises(db, league);
      if (!teams.ok) return teams.error.kind === 'storage' ? teams.error.error.message : 'Could not read teams.';
      const rosters = await listRosters(db, league);
      if (!rosters.ok) return rosters.error.kind === 'storage' ? rosters.error.error.message : 'Could not read rosters.';
      if (teams.value.unreadable > 0 || rosters.value.unreadable > 0) {
        return 'Some saved teams or rosters could not be read, so the cards were not produced.';
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
      const done =
        action === 'print' ? await printHtml(sheets.html) : await savePdf(sheets.html, pdfFileName(league.name, season!.index));
      return done.ok ? null : done.error.message;
    }
  }, [db, league, season]);

  const print = useCallback(() => start('print'), [start]);
  const saveAsPdf = useCallback(() => start('pdf'), [start]);

  return { print, saveAsPdf, active, error };
}
