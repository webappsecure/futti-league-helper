import { fail, ok, type Result } from '@/storage/types';

/** Prints the document from a hidden frame; `expo-print` on web would print the app page instead. */
export function printHtml(html: string): Promise<Result<void>> {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    // A zero-size or hidden frame prints as an empty document, so keep it page-sized and just out of sight.
    frame.style.cssText = 'position:fixed;left:0;top:0;width:11in;height:8.5in;border:0;opacity:0;pointer-events:none;z-index:-1';
    const cleanup = () => frame.remove();
    frame.onload = () => {
      try {
        const win = frame.contentWindow;
        if (win === null || win.document.querySelector('.sheet') === null) throw new Error('The print frame could not be opened');
        win.onafterprint = cleanup;
        win.focus();
        win.print();
        resolve(ok(undefined));
      } catch (e) {
        cleanup();
        resolve(fail(e));
      }
    };
    // Set before inserting: a frame inserted without it first loads about:blank, fires `load` and would print that.
    frame.srcdoc = html;
    document.body.appendChild(frame);
  });
}
