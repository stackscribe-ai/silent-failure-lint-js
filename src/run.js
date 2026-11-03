'use strict';

const fs = require('fs');
const path = require('path');
const { lint } = require('./checks');

const EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage']);

function collectFiles(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) {
    return EXTENSIONS.has(path.extname(target)) ? [target] : [];
  }
  const out = [];
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(target, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectFiles(full));
    } else if (EXTENSIONS.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

function runOnPaths(paths) {
  const files = [];
  for (const p of paths) {
    files.push(...collectFiles(p));
  }
  let totalFindings = 0;
  let filesWithFindings = 0;
  let parseErrors = 0;
  const results = [];

  for (const file of files) {
    const code = fs.readFileSync(file, 'utf8');
    const { findings, error } = lint(code, file);
    if (error) {
      parseErrors += 1;
      results.push({ file, error });
      continue;
    }
    if (findings.length > 0) {
      filesWithFindings += 1;
      totalFindings += findings.length;
      results.push({ file, findings });
    }
  }

  return { files, results, totalFindings, filesWithFindings, parseErrors };
}

module.exports = { runOnPaths, collectFiles };
