import { pdfFileName } from './pdf-file-name';

describe('pdfFileName', () => {
  it('uses the league name and season number', () => {
    expect(pdfFileName('Maple League', 3)).toBe('Maple League season 3 cards.pdf');
  });

  it('removes illegal characters and collapses spaces', () => {
    expect(pdfFileName('A/B: "C"?  D*', 1)).toBe('A B C D season 1 cards.pdf');
  });

  it('falls back when nothing is left', () => {
    expect(pdfFileName('  / : ', 2)).toBe('Game cards season 2 cards.pdf');
    expect(pdfFileName('...', 2)).toBe('Game cards season 2 cards.pdf');
  });

  it('caps long names', () => {
    expect(pdfFileName('x'.repeat(200), 1)).toBe(`${'x'.repeat(80)} season 1 cards.pdf`);
  });
});
