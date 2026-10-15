import * as Print from 'expo-print';

import { fail, ok, type Result } from '@/storage/types';
import { isPrintCancelled } from './print-cancelled';
import { SHEET_HEIGHT_IN, SHEET_WIDTH_IN } from './card-layout';

/** Opens the system print dialog; width and height are US Letter landscape in points. */
export async function printHtml(html: string): Promise<Result<void>> {
  try {
    await Print.printAsync({ html, width: SHEET_WIDTH_IN * 72, height: SHEET_HEIGHT_IN * 72 });
    return ok(undefined);
  } catch (e) {
    // Dismissing the dialog is not a failure.
    return isPrintCancelled(e) ? ok(undefined) : fail(e);
  }
}
