#!/usr/bin/env node
'use strict';

const path = require('path');
const { runOnPaths } = require('../src/run');

function printUsage() {
  console.log('Usage: silent-failure-lint-js <path> [<path> ...] [--json]');
  console.log('');
  console.log('Scans JS/TS files for silently-swallowed async/IO errors:');
  console.log('  SFJS001  empty or console-only catch block');
  console.log('  SFJS002  Promise.all() with no try/catch or .catch()');
  console.log('  SFJS003  fetch()/axios call with no timeout/signal');
  console.log('  SFJS004  standalone .then() with no .catch() in the chain');
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    printUsage();
    process.exit(args.length === 0 ? 1 : 0);
  }

  const asJson = args.includes('--json');
  const paths = args.filter((a) => a !== '--json');

  const { results, totalFindings, filesWithFindings, parseErrors, files } = runOnPaths(paths);

  if (asJson) {
    console.log(JSON.stringify({ results, totalFindings, filesWithFindings, parseErrors }, null, 2));
    process.exit(totalFindings > 0 ? 1 : 0);
  }

  for (const r of results) {
    const rel = path.relative(process.cwd(), r.file);
    if (r.error) {
      console.log(`${rel}: ${r.error}`);
      continue;
    }
    for (const f of r.findings) {
      console.log(`${rel}:${f.line}:${f.col + 1}  ${f.rule}  ${f.message}`);
    }
  }

  console.log('');
  console.log(
    `Scanned ${files.length} file(s), ${totalFindings} finding(s) in ${filesWithFindings} file(s)` +
      (parseErrors ? `, ${parseErrors} parse error(s)` : '')
  );

  process.exit(totalFindings > 0 ? 1 : 0);
}

main();
