// Fetches the metropolitan French municipalities and municipal arrondissements from the official
// "Decoupage administratif" API (https://geo.api.gouv.fr) and writes db/seeds/reference/municipality.csv.
//
// Run it once, by hand, when the reference data must be refreshed. It is NOT run at database load time.
//   node db/seeds/reference/tools/fetch-municipalities.mjs
//
// Node 24 only (built-in fetch, no dependencies). Licence of the data: Licence Ouverte / Open Licence 2.0 (Etalab).

import { writeFile } from 'node:fs/promises';

const API = 'https://geo.api.gouv.fr/communes';
const FIELDS = 'nom,code,codeDepartement,population,centre';
const OUTPUT = new URL('../municipality.csv', import.meta.url);
const HEADER = 'insee_code,name,department_code,population,lat,lng,parent_insee_code';

// The API gives no parent for an arrondissement. Its INSEE code starts with the code prefix of its city:
// Paris 75101-75120, Marseille 13201-13216, Lyon 69381-69389.
const CITY_PREFIXES = [
  { prefix: '751', parent: '75056' }, // Paris
  { prefix: '132', parent: '13055' }, // Marseille
  { prefix: '6938', parent: '69123' }, // Lyon
];

async function fetchType(type) {
  const url = `${API}?type=${type}&fields=${FIELDS}`;
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`GET ${url} failed with HTTP ${response.status}`);
  }
  const items = await response.json();
  if (!Array.isArray(items)) {
    throw new Error(`GET ${url} did not return a list`);
  }
  return items;
}

function isMetropolitan(item) {
  return !/^(97|98)/.test(item.codeDepartement);
}

function parentCodeOf(arrondissementCode) {
  const match = CITY_PREFIXES.find(({ prefix }) => arrondissementCode.startsWith(prefix));
  if (match === undefined) {
    throw new Error(`No parent city known for arrondissement ${arrondissementCode}`);
  }
  return match.parent;
}

function csvText(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

const [communeItems, arrondissementItems] = await Promise.all([
  fetchType('commune-actuelle'),
  fetchType('arrondissement-municipal'),
]);

let overseasSkipped = 0;
let missingPopulation = 0;
const rows = new Map();

function addRow(item, parentInsee) {
  if (!Array.isArray(item.centre?.coordinates)) {
    throw new Error(`No center point for ${item.code} ${item.nom}`);
  }
  const [lng, lat] = item.centre.coordinates;
  let population = item.population;
  if (!Number.isInteger(population)) {
    missingPopulation += 1;
    population = 0;
  }
  if (rows.has(item.code)) {
    throw new Error(`Duplicate INSEE code ${item.code}`);
  }
  rows.set(item.code, {
    insee: item.code,
    name: item.nom,
    department: item.codeDepartement,
    population,
    lat,
    lng,
    parent: parentInsee,
  });
}

for (const item of communeItems) {
  if (isMetropolitan(item)) {
    addRow(item, '');
  } else {
    overseasSkipped += 1;
  }
}
const communeCount = rows.size;

for (const item of arrondissementItems) {
  if (!isMetropolitan(item)) {
    overseasSkipped += 1;
    continue;
  }
  const parent = parentCodeOf(item.code);
  if (!rows.has(parent)) {
    throw new Error(`Parent ${parent} of arrondissement ${item.code} is not in the commune list`);
  }
  addRow(item, parent);
}
const arrondissementCount = rows.size - communeCount;

const sorted = [...rows.values()].sort((a, b) => (a.insee < b.insee ? -1 : a.insee > b.insee ? 1 : 0));
const lines = [HEADER];
for (const row of sorted) {
  lines.push(
    [row.insee, csvText(row.name), row.department, row.population, row.lat, row.lng, row.parent].join(','),
  );
}

await writeFile(OUTPUT, `${lines.join('\n')}\n`, 'utf8');

console.log(`Communes (metropolitan): ${communeCount}`);
console.log(`Arrondissements (Paris, Lyon, Marseille): ${arrondissementCount}`);
console.log(`Total rows written: ${sorted.length}`);
console.log(`Overseas rows skipped (97x, 98x): ${overseasSkipped}`);
console.log(`Rows with missing population (set to 0): ${missingPopulation}`);
console.log(`Written to ${OUTPUT.pathname}`);
