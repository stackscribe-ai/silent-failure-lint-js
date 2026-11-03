'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { lint } = require('../src/checks');

function rulesFound(code, filePath = 'test.ts') {
  const { findings, error } = lint(code, filePath);
  assert.equal(error, undefined, `unexpected parse error: ${error}`);
  return findings.map((f) => f.rule);
}

test('SFJS001: flags empty catch block', () => {
  const code = `
    try { doThing(); } catch (e) {}
  `;
  assert.deepEqual(rulesFound(code), ['SFJS001']);
});

test('SFJS001: flags console-only catch block', () => {
  const code = `
    try { doThing(); } catch (e) { console.error(e); }
  `;
  assert.deepEqual(rulesFound(code), ['SFJS001']);
});

test('SFJS001: does not flag catch that rethrows', () => {
  const code = `
    try { doThing(); } catch (e) { throw e; }
  `;
  assert.deepEqual(rulesFound(code), []);
});

test('SFJS001: does not flag catch with a fallback/handler call', () => {
  const code = `
    try { doThing(); } catch (e) { handleError(e); return null; }
  `;
  assert.deepEqual(rulesFound(code), []);
});

test('SFJS002: flags bare Promise.all', () => {
  const code = `
    async function run() {
      const results = await Promise.all([a(), b(), c()]);
      return results;
    }
  `;
  assert.deepEqual(rulesFound(code), ['SFJS002']);
});

test('SFJS002: does not flag Promise.all with .catch()', () => {
  const code = `
    Promise.all([a(), b()]).catch((e) => console.error(e));
  `;
  assert.deepEqual(rulesFound(code), []);
});

test('SFJS002: does not flag Promise.all inside try/catch', () => {
  const code = `
    async function run() {
      try {
        await Promise.all([a(), b()]);
      } catch (e) {
        handleError(e);
      }
    }
  `;
  assert.deepEqual(rulesFound(code), []);
});

test('SFJS003: flags fetch() with no options', () => {
  const code = `fetch('https://example.com/api');`;
  assert.deepEqual(rulesFound(code), ['SFJS003']);
});

test('SFJS003: flags fetch() with options but no signal/timeout', () => {
  const code = `fetch('https://example.com/api', { method: 'POST' });`;
  assert.deepEqual(rulesFound(code), ['SFJS003']);
});

test('SFJS003: does not flag fetch() with an AbortSignal', () => {
  const code = `
    const controller = new AbortController();
    fetch('https://example.com/api', { signal: controller.signal });
  `;
  assert.deepEqual(rulesFound(code), []);
});

test('SFJS003: flags axios.get() with no timeout', () => {
  const code = `axios.get('https://example.com/api');`;
  assert.deepEqual(rulesFound(code), ['SFJS003']);
});

test('SFJS003: does not flag axios.get() with a timeout', () => {
  const code = `axios.get('https://example.com/api', { timeout: 5000 });`;
  assert.deepEqual(rulesFound(code), []);
});

test('SFJS004: flags standalone .then() with no .catch()', () => {
  const code = `doAsyncThing().then((result) => use(result));`;
  assert.deepEqual(rulesFound(code), ['SFJS004']);
});

test('SFJS004: does not flag .then().catch() chain', () => {
  const code = `doAsyncThing().then((r) => use(r)).catch((e) => log(e));`;
  assert.deepEqual(rulesFound(code), []);
});

test('SFJS004: does not flag .then() that is returned/awaited', () => {
  const code = `
    async function run() {
      return doAsyncThing().then((r) => use(r));
    }
  `;
  assert.deepEqual(rulesFound(code), []);
});

test('TSX/TS input parses and is scanned like JS', () => {
  const code = `
    async function run(): Promise<void> {
      try { await doThing(); } catch (e) {}
    }
  `;
  assert.deepEqual(rulesFound(code, 'test.ts'), ['SFJS001']);
});

test('clean file produces no findings', () => {
  const code = `
    async function run() {
      const controller = new AbortController();
      try {
        const res = await fetch('https://example.com', { signal: controller.signal });
        return res.json();
      } catch (e) {
        logger.error('fetch failed', e);
        throw e;
      }
    }
  `;
  assert.deepEqual(rulesFound(code), []);
});

test('invalid syntax returns a parse error instead of throwing', () => {
  const { error, findings } = lint('function (() {', 'bad.js');
  assert.ok(error);
  assert.equal(findings, undefined);
});
