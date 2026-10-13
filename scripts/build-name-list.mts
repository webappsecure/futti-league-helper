import { readFileSync, writeFileSync } from 'node:fs';

import { buildNamePool } from '../src/names/normalize-name.ts';

const INPUT = new URL('../blueprint/reference/lastnames.txt', import.meta.url);
const OUTPUT = new URL('../src/data/last-names.json', import.meta.url);

const lines = readFileSync(INPUT, 'utf8').split(/\r?\n/);
const pool = buildNamePool(lines);

writeFileSync(OUTPUT, `[\n${pool.names.map((name) => `  ${JSON.stringify(name)}`).join(',\n')}\n]\n`);

console.log(`Lines read: ${pool.linesRead}`);
console.log(`Invalid names dropped: ${pool.invalid.length}`);
for (const name of pool.invalid.slice(0, 50)) console.log(`  ${JSON.stringify(name)}`);
if (pool.invalid.length > 50) console.log(`  ...and ${pool.invalid.length - 50} more`);
console.log(`Duplicates removed after normalizing: ${pool.duplicatesRemoved}`);
console.log(`Names written: ${pool.names.length}`);
