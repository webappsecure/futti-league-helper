import * as Print from 'expo-print';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { fail, ok, type Result } from '@/storage/types';
import { SHEET_HEIGHT_IN, SHEET_WIDTH_IN } from './card-layout';

/** Renders the document to a PDF named `fileName` and opens the share sheet (Save to Files, etc.). */
export async function savePdf(html: string, fileName: string): Promise<Result<void>> {
  try {
    if (!(await Sharing.isAvailableAsync())) return fail(new Error('Sharing is not available on this device.'));
    const printed = await Print.printToFileAsync({ html, width: SHEET_WIDTH_IN * 72, height: SHEET_HEIGHT_IN * 72 });
    let uri = printed.uri;
    try {
      // The renderer picks a random file name; a readable one is what the user sees when saving.
      const named = new File(Paths.cache, fileName);
      if (named.exists) named.delete();
      await new File(printed.uri).move(named);
      uri = named.uri;
    } catch {
      // Keep the generated name rather than failing the save.
    }
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Save game cards' });
    return ok(undefined);
  } catch (e) {
    return fail(e);
  }
}
