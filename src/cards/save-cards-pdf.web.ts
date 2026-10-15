import { fail, type Result } from '@/storage/types';

/** Web prints through the browser dialog, which can save a PDF; this is never offered there. */
export async function savePdf(_html: string, _fileName: string): Promise<Result<void>> {
  return fail(new Error('Saving a PDF is only available in the iOS and Android apps. Use Print cards instead.'));
}
