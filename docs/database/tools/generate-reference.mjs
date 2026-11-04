// Generates docs/database/data-layer-reference.md: every repository exported by apps/api/src/data/index.ts, with its
// public methods, their signatures and their TSDoc (the TSDoc is the reference, data-layer-guide.md §8).
// Run from the repository root: npm run docs:data
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(resolve(root, 'apps/api/package.json'));
const ts = require('typescript');

const dataDir = resolve(root, 'apps/api/src/data');
const index = readFileSync(resolve(dataDir, 'index.ts'), 'utf8');
const exported = [...index.matchAll(/export \{ (\w+) \} from '\.\/(repositories\/[\w.-]+|chat-event-listener)';/g)].map(
  (m) => ({ name: m[1], file: resolve(dataDir, `${m[2]}.ts`) }),
);
const errors = [...index.matchAll(/^\s+(\w+Error),?$/gm)].map((m) => m[1]);

const out = [];
out.push('# TeamDrop data layer reference');
out.push('');
out.push('> Generated from the TSDoc of `apps/api/src/data` by `npm run docs:data`. Do not edit by hand.');
out.push('> How to use the data layer: `data-layer-guide.md`. Business rules: `business-rules.md` (the master).');
out.push('');
out.push('## Contents');
out.push('');
for (const { name } of exported) out.push(`- [${name}](#${name.toLowerCase()})`);
out.push('- [Errors](#errors)');
out.push('');

function docOf(node, source) {
  const ranges = ts.getLeadingCommentRanges(source.text, node.getFullStart()) ?? [];
  const jsdoc = ranges.map((r) => source.text.slice(r.pos, r.end)).filter((t) => t.startsWith('/**')).pop();
  if (!jsdoc) return '';
  return jsdoc
    .replace(/^\/\*\*\s*/, '')
    .replace(/\s*\*\/$/, '')
    .split('\n')
    .map((line) => line.replace(/^\s*\* ?/, ''))
    .join('\n')
    .trim();
}

function signatureOf(method, source) {
  const params = method.parameters.map((p) => p.getText(source).replace(/\s+/g, ' ')).join(', ');
  const type = method.type ? method.type.getText(source).replace(/\s+/g, ' ') : 'void';
  return `${method.name.getText(source)}(${params}): ${type}`;
}

for (const { name, file } of exported) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const cls = source.statements.find((s) => ts.isClassDeclaration(s) && s.name?.text === name);
  if (!cls) continue;
  out.push(`## ${name}`);
  out.push('');
  out.push(`Source: \`${file.slice(root.length + 1).replace(/\\/g, '/')}\``);
  out.push('');
  const classDoc = docOf(cls, source);
  if (classDoc) {
    out.push(classDoc);
    out.push('');
  }
  for (const member of cls.members) {
    if (!ts.isMethodDeclaration(member)) continue;
    const modifiers = ts.getModifiers(member) ?? [];
    if (modifiers.some((m) => m.kind === ts.SyntaxKind.PrivateKeyword || m.kind === ts.SyntaxKind.ProtectedKeyword)) {
      continue;
    }
    out.push(`### \`${name}.${member.name.getText(source)}\``);
    out.push('');
    out.push('```ts');
    out.push(signatureOf(member, source));
    out.push('```');
    out.push('');
    const doc = docOf(member, source);
    if (doc) {
      out.push(doc);
      out.push('');
    }
  }
}

// Errors: class name, code and description.
const errorSource = ts.createSourceFile('errors.ts', readFileSync(resolve(dataDir, 'errors.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
out.push('## Errors');
out.push('');
out.push('Switch on `error.code`, never on the message (data-layer-guide.md §5).');
out.push('');
out.push('| Class | Code | When |');
out.push('|---|---|---|');
for (const statement of errorSource.statements) {
  if (!ts.isClassDeclaration(statement) || !statement.name) continue;
  const className = statement.name.text;
  if (className !== 'DataError' && !errors.includes(className)) continue;
  const code = /super\('([A-Z_]+)'/.exec(statement.getText(errorSource))?.[1] ?? '(any)';
  out.push(`| \`${className}\` | \`${code}\` | ${docOf(statement, errorSource).replace(/\n/g, ' ')} |`);
}
out.push('| (none) | `INVALID_CURSOR` | A pagination cursor that was not returned by the data layer. |');
out.push('');

writeFileSync(resolve(root, 'docs/database/data-layer-reference.md'), out.join('\n'));
console.log(`docs/database/data-layer-reference.md: ${exported.length} classes.`);
