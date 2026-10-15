const MAX_NAME_LENGTH = 80;

/** `<league> season <n> cards.pdf` with characters that are illegal in file names removed. */
export function pdfFileName(leagueName: string, seasonIndex: number): string {
  const cleaned = leagueName
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH)
    .trim()
    // A leading or trailing dot is awkward or illegal on some file systems.
    .replace(/^\.+|\.+$/g, '')
    .trim();
  return `${cleaned === '' ? 'Game cards' : cleaned} season ${seasonIndex} cards.pdf`;
}
