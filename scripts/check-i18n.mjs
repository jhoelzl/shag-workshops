import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const dePath = resolve(process.cwd(), 'src/i18n/de.json');
const enPath = resolve(process.cwd(), 'src/i18n/en.json');

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function collectLeafKeys(value, prefix = '', out = new Set()) {
  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    for (const [key, child] of entries) {
      const nextPrefix = prefix ? `${prefix}.${key}` : key;
      collectLeafKeys(child, nextPrefix, out);
    }
    return out;
  }

  out.add(prefix);
  return out;
}

function findTypeMismatches(left, right, prefix = '', mismatches = []) {
  const leftIsObject = isPlainObject(left);
  const rightIsObject = isPlainObject(right);

  if (leftIsObject !== rightIsObject) {
    mismatches.push(prefix || '(root)');
    return mismatches;
  }

  if (!leftIsObject || !rightIsObject) {
    return mismatches;
  }

  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (!(key in left) || !(key in right)) continue;
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    findTypeMismatches(left[key], right[key], nextPrefix, mismatches);
  }

  return mismatches;
}

function printList(header, values) {
  if (values.length === 0) return;
  console.error(`\n${header}`);
  for (const value of values) {
    console.error(`- ${value}`);
  }
}

async function main() {
  const [deRaw, enRaw] = await Promise.all([
    readFile(dePath, 'utf8'),
    readFile(enPath, 'utf8'),
  ]);

  const deJson = JSON.parse(deRaw);
  const enJson = JSON.parse(enRaw);

  const deKeys = collectLeafKeys(deJson);
  const enKeys = collectLeafKeys(enJson);

  const missingInEn = [...deKeys].filter((key) => !enKeys.has(key)).sort();
  const missingInDe = [...enKeys].filter((key) => !deKeys.has(key)).sort();
  const typeMismatches = [...new Set(findTypeMismatches(deJson, enJson))].sort();

  if (missingInEn.length === 0 && missingInDe.length === 0 && typeMismatches.length === 0) {
    console.log('i18n check passed: de.json and en.json have matching keys and compatible structure.');
    process.exit(0);
  }

  console.error('i18n check failed.');
  printList('Missing in en.json:', missingInEn);
  printList('Missing in de.json:', missingInDe);
  printList('Type mismatches between de.json and en.json:', typeMismatches);
  process.exit(1);
}

main().catch((error) => {
  console.error('i18n check failed with an unexpected error.');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
