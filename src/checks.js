'use strict';

const { parse, simpleTraverse } = require('@typescript-eslint/typescript-estree');

/**
 * Each check is a best-effort heuristic over the syntax tree, not a sound
 * analysis: it flags code *shapes* that commonly hide errors in async/IO
 * JS/TS code. False positives are possible; read the flagged line before
 * changing it. Mirrors the rule numbering scheme of the Python sibling
 * project (silent-failure-lint) but is a fully independent JS/TS ruleset.
 */

const TIMEOUT_HINTS = new Set(['signal', 'timeout']);
const FETCH_LIKE_CALLEES = new Set(['fetch', 'axios']);
const AXIOS_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'request']);

function parseSource(code, filePath) {
  return parse(code, {
    loc: true,
    range: true,
    jsx: filePath.endsWith('.jsx') || filePath.endsWith('.tsx'),
    errorOnUnknownASTType: false,
  });
}

function finding(rule, node, message) {
  return {
    rule,
    line: node.loc.start.line,
    col: node.loc.start.column,
    message,
  };
}

function isNoopCatchBody(body) {
  const stmts = body.body;
  if (stmts.length === 0) return true;
  // A single console.* call with nothing else (logged but swallowed).
  if (stmts.length === 1) {
    const stmt = stmts[0];
    if (
      stmt.type === 'ExpressionStatement' &&
      stmt.expression.type === 'CallExpression' &&
      stmt.expression.callee.type === 'MemberExpression' &&
      stmt.expression.callee.object.type === 'Identifier' &&
      stmt.expression.callee.object.name === 'console'
    ) {
      return true;
    }
  }
  return false;
}

function checkSilentCatch(ast) {
  const findings = [];
  simpleTraverse(ast, {
    enter(node) {
      if (node.type !== 'CatchClause') return;
      if (isNoopCatchBody(node.body)) {
        findings.push(
          finding(
            'SFJS001',
            node,
            'catch block is empty or only logs to console, with no rethrow, ' +
              'fallback or caller-visible signal - the failure disappears silently'
          )
        );
      }
    },
  });
  return findings;
}

function hasCatchChain(node) {
  // Walk up a MemberExpression/CallExpression chain looking for `.catch(`.
  let current = node;
  while (current && current.parent) {
    const parent = current.parent;
    if (
      parent.type === 'MemberExpression' &&
      parent.property.type === 'Identifier' &&
      parent.property.name === 'catch' &&
      parent.object === current
    ) {
      return true;
    }
    if (parent.type === 'MemberExpression' && parent.object === current) {
      current = parent;
      continue;
    }
    if (parent.type === 'CallExpression' && parent.callee === current) {
      current = parent;
      continue;
    }
    break;
  }
  return false;
}

function isInsideTryBlock(node) {
  let current = node;
  while (current && current.parent) {
    if (current.parent.type === 'TryStatement' && current.parent.block === current) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function checkPromiseAllRejectionLeak(ast) {
  const findings = [];
  simpleTraverse(ast, {
    enter(node) {
      if (node.type !== 'CallExpression') return;
      const callee = node.callee;
      const isPromiseAll =
        callee.type === 'MemberExpression' &&
        callee.object.type === 'Identifier' &&
        callee.object.name === 'Promise' &&
        callee.property.type === 'Identifier' &&
        callee.property.name === 'all';
      if (!isPromiseAll) return;
      if (hasCatchChain(node) || isInsideTryBlock(node)) return;
      findings.push(
        finding(
          'SFJS002',
          node,
          'Promise.all() with no surrounding try/catch or .catch() - if one ' +
            'promise rejects, the others keep running untracked; any rejection ' +
            'THEY raise later becomes an unhandled promise rejection, never seen here'
        )
      );
    },
  });
  return findings;
}

function hasTimeoutOption(node) {
  if (node.arguments.length < 2) return false;
  const opts = node.arguments[node.arguments.length - 1];
  if (!opts || opts.type !== 'ObjectExpression') return false;
  return opts.properties.some(
    (p) =>
      p.type === 'Property' &&
      p.key.type === 'Identifier' &&
      TIMEOUT_HINTS.has(p.key.name)
  );
}

function checkMissingTimeout(ast) {
  const findings = [];
  simpleTraverse(ast, {
    enter(node) {
      if (node.type !== 'CallExpression') return;
      const callee = node.callee;
      let isFetchLike = false;
      if (callee.type === 'Identifier' && FETCH_LIKE_CALLEES.has(callee.name)) {
        isFetchLike = true;
      } else if (
        callee.type === 'MemberExpression' &&
        callee.object.type === 'Identifier' &&
        callee.object.name === 'axios' &&
        callee.property.type === 'Identifier' &&
        AXIOS_METHODS.has(callee.property.name)
      ) {
        isFetchLike = true;
      }
      if (!isFetchLike) return;
      if (hasTimeoutOption(node)) return;
      findings.push(
        finding(
          'SFJS003',
          node,
          'HTTP call has no timeout/signal option - a hanging peer holds this ' +
            'request open forever instead of failing loudly'
        )
      );
    },
  });
  return findings;
}

function isStatementExpression(node) {
  return node.parent && node.parent.type === 'ExpressionStatement';
}

function checkThenWithoutCatch(ast) {
  const findings = [];
  simpleTraverse(ast, {
    enter(node) {
      if (node.type !== 'CallExpression') return;
      const callee = node.callee;
      if (
        callee.type !== 'MemberExpression' ||
        callee.property.type !== 'Identifier' ||
        callee.property.name !== 'then'
      ) {
        return;
      }
      // Only flag a .then() chain that is used as a standalone statement
      // (fire-and-forget) and has no .catch() anywhere further down the chain.
      if (!isStatementExpression(node)) return;
      if (hasCatchChain(node)) return;
      findings.push(
        finding(
          'SFJS004',
          node,
          '.then() used as a standalone statement with no .catch() in the ' +
            'chain - a rejection here becomes an unhandled promise rejection ' +
            'that nothing in this function will ever observe'
        )
      );
    },
  });
  return findings;
}

const ALL_CHECKS = [
  checkSilentCatch,
  checkPromiseAllRejectionLeak,
  checkMissingTimeout,
  checkThenWithoutCatch,
];

function attachParents(ast) {
  simpleTraverse(ast, { enter() {} }, true);
}

function lint(code, filePath) {
  let ast;
  try {
    ast = parseSource(code, filePath);
  } catch (err) {
    return { error: `parse error: ${err.message}` };
  }
  attachParents(ast);
  const findings = [];
  for (const check of ALL_CHECKS) {
    findings.push(...check(ast));
  }
  findings.sort((a, b) => a.line - b.line || a.col - b.col);
  return { findings };
}

module.exports = { lint };
