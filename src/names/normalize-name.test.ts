import { buildNamePool, normalizeName } from './normalize-name';

const EXAMPLES: [string, string][] = [
  ['MARTÍN', 'MARTIN'],
  ['MARTIN', 'MARTIN'],
  ['ŁUKASZ', 'LUKASZ'],
  ['łukasz', 'LUKASZ'],
  ['ØSTBY', 'OSTBY'],
  ['østby', 'OSTBY'],
  ["FONTE'", 'FONTE'],
  ["PIETRE’", 'PIETRE'],
  ["O'BRIEN'", "O'BRIEN"],
  ["SMITH '", 'SMITH'],
  ["O' '", 'O'],
  ["O'BRIEN' '", "O'BRIEN"],
  ['KJÆR', 'KJAER'],
  ['kjær', 'KJAER'],
  ['ST. JOHN', 'ST JOHN'],
  ['JAGIELSKA.', 'JAGIELSKA'],
  ['ÅBERG', 'ABERG'],
  ['ADAMČÍK', 'ADAMCIK'],
  ['Straße', 'STRASSE'],
  ['A’LEA', "A'LEA"],
  ["A'LEA", "A'LEA"],
  ["O'BRIEN", "O'BRIEN"],
  ['VAN DER BERG', 'VAN DER BERG'],
  ['SMITH-JONES', 'SMITH-JONES'],
  ['  VAN   DER  BERG ', 'VAN DER BERG'],
  ['smith', 'SMITH'],
];

describe('normalizeName', () => {
  it.each(EXAMPLES)('%s becomes %s', (raw, expected) => expect(normalizeName(raw)).toBe(expected));

  it('never changes a name that was already normalized', () => {
    for (const [raw] of EXAMPLES) {
      const once = normalizeName(raw);
      if (once !== null) expect(normalizeName(once)).toBe(once);
    }
  });

  it.each(['', '   ', '123', 'SMITH2', '-SMITH', "'SMITH", '李', '😀', 'SMITH😀', 'Đ', "'", 'GIOVANNI*', 'SUK (NAME)', 'CARNOVALE/O', '.'])(
    'rejects %j',
    (raw) => expect(normalizeName(raw)).toBeNull(),
  );
});

describe('buildNamePool', () => {
  it('collapses spellings that normalize together and reports the work', () => {
    const pool = buildNamePool(['MARTÍN', 'MARTIN', 'ABEL', '', '李', 'ABEL', 'ŁUKA']);
    expect(pool).toEqual({
      names: ['ABEL', 'LUKA', 'MARTIN'],
      invalid: ['李'],
      duplicatesRemoved: 2,
      linesRead: 7,
    });
  });

  it('drops names whose period-stripped form already exists', () => {
    const pool = buildNamePool(['ST JOHN', 'ST. JOHN', 'JAGIELSKA.']);
    expect(pool.names).toEqual(['JAGIELSKA', 'ST JOHN']);
    expect(pool.duplicatesRemoved).toBe(1);
  });

  it('counts a name with a trailing apostrophe as a duplicate of the plain name', () => {
    const pool = buildNamePool(["FONTE'", 'FONTE', "PIETRE'"]);
    expect(pool.names).toEqual(['FONTE', 'PIETRE']);
    expect(pool.duplicatesRemoved).toBe(1);
  });

  it('is sorted and independent of input order', () => {
    const a = buildNamePool(['ZED', 'ÁBE', 'MOE', 'ABE']);
    const b = buildNamePool(['MOE', 'ABE', 'ZED', 'ÁBE']);
    expect(a.names).toEqual(['ABE', 'MOE', 'ZED']);
    expect(b.names).toEqual(a.names);
  });
});
