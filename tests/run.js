#!/usr/bin/env node

/**
 * tests/run.js — tokenizer test runner
 *
 * Pure Node + assert. Runs each test file, reports pass/fail + summary.
 * Zero deps. Invoke: `node tests/run.js`.
 */

const fs = require('fs');
const path = require('path');

const TEST_DIR = __dirname;
const testFiles = fs.readdirSync(TEST_DIR)
  .filter(f => f.startsWith('test-') && f.endsWith('.js'))
  .sort();

let totalPass = 0;
let totalFail = 0;
const failures = [];

function color(s, c) {
  const codes = { green: 32, red: 31, gray: 90, bold: 1 };
  return `\x1b[${codes[c]}m${s}\x1b[0m`;
}

async function runSuite(file) {
  const suitePath = path.join(TEST_DIR, file);
  const suiteName = path.basename(file, '.js').replace(/^test-/, '');
  console.log(color(`\n━━ ${suiteName} ━━`, 'bold'));

  const suite = require(suitePath);
  const tests = Object.entries(suite);

  for (const [name, fn] of tests) {
    try {
      await fn();
      console.log(`  ${color('✓', 'green')} ${name}`);
      totalPass += 1;
    } catch (err) {
      console.log(`  ${color('✗', 'red')} ${name}`);
      console.log(color(`    ${err.message}`, 'red'));
      if (err.stack) {
        const shortStack = err.stack.split('\n').slice(1, 3).join('\n');
        console.log(color(shortStack, 'gray'));
      }
      totalFail += 1;
      failures.push(`${suiteName}:${name} — ${err.message}`);
    }
  }
}

(async () => {
  for (const file of testFiles) {
    await runSuite(file);
  }

  const total = totalPass + totalFail;
  console.log(`\n${color('━'.repeat(40), 'bold')}`);
  console.log(`${color('pass', 'green')}: ${totalPass}/${total}`);
  if (totalFail > 0) {
    console.log(`${color('fail', 'red')}: ${totalFail}/${total}`);
    process.exit(1);
  }
  console.log(color('all tests passed', 'green'));
})();
