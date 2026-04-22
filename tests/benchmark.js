#!/usr/bin/env node

/**
 * benchmark.js — real compression benchmark
 *
 * Sets up a realistic demo project with bloated agent configs,
 * runs compression, reports before/after token totals.
 *
 * Invoke: `node tests/benchmark.js`
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { scanProject } = require('../core/scanner');
const { compressFile } = require('../core/compressor');
const { scanMcpConfig } = require('../core/mcp');

const { mkTempDir, rmDir, write } = require('./helpers');

function color(s, c) {
  const codes = { green: 32, red: 31, gray: 90, bold: 1, cyan: 36, yellow: 33 };
  return `\x1b[${codes[c]}m${s}\x1b[0m`;
}

// ── Bloated fixture content (realistic verbose agent instructions) ─────────
const BLOATED_CLAUDE_MD = `# Project Instructions

## Overview

This is a comprehensive set of instructions for the Claude Code assistant that outlines all of the important guidelines and conventions that you should always follow when working on this project. It is really important that you carefully read through all of the sections below because they contain essential information that will help you to be more effective when assisting with the various tasks that you will be asked to perform.

## Coding Standards

It is very important that you always follow the coding standards that are outlined in this document. We have spent a lot of time developing these standards and we want to make sure that everyone on the team follows them consistently. Please make sure to adhere to these guidelines at all times because they help ensure code quality and maintainability.

### TypeScript

You should always use TypeScript for all new files that you create in this project. We do not want you to use plain JavaScript files anymore because we have decided that TypeScript provides better type safety and a better developer experience overall. Please make sure that you enable strict mode in your TypeScript configuration because this will help catch many common bugs at compile time instead of at runtime.

In addition to that, please make sure that you always provide explicit type annotations for function parameters and return values. Do not rely on type inference for public APIs because this makes the code harder to understand and refactor later on.

### Error Handling

It is really important that you add proper error handling for all async operations that you write in this codebase. We have had many issues in the past with unhandled promise rejections that caused production outages and we want to make sure that this does not happen again in the future.

Please make sure that you always wrap async operations in try/catch blocks or use .catch() handlers on promises. You should also log errors with sufficient context so that we can debug issues in production environments.

## Testing

Please make sure that you always write comprehensive tests for all new functionality that you implement. We use Jest for unit tests and Playwright for end-to-end tests. Keep in mind that we have a minimum code coverage threshold of 80% that must be maintained at all times on this project.

You should also make sure that your tests are isolated and do not depend on external services. Use mocks and stubs where appropriate to ensure that tests run quickly and reliably in the CI environment.

## Code Review

Remember that all code changes must go through code review before they can be merged. Please make sure that you address all feedback from reviewers before requesting approval. Do not merge your own pull requests without getting approval from at least one other team member.

## Documentation

It is really important that you always keep documentation up to date when you make changes to the code. If you modify the behavior of a function or class, please make sure that you update the corresponding documentation as well.

\`\`\`typescript
function authenticate(token: string): boolean {
  if (!token) return false;
  return verifyToken(token);
}
\`\`\`
`;

const BLOATED_COPILOT_INSTRUCTIONS = `# Copilot Instructions for This Project

## Introduction

Welcome to this project! This document contains a comprehensive set of instructions that you should follow when working on this codebase with GitHub Copilot. Please take the time to read through all of the sections carefully because they contain important information that will help you to be more effective.

## Language and Framework

We are using TypeScript for this project, so please make sure that you always write TypeScript code instead of JavaScript. This is really important for maintaining type safety across the codebase. In addition to that, we are using React for the frontend and Node.js with Express for the backend.

## Code Style

Please make sure that you follow the existing code style that is used throughout the codebase. We use Prettier for formatting and ESLint for linting. You should always run these tools before committing your changes to make sure that your code is properly formatted and does not have any linting errors.

## Testing

It is really important that you write tests for all new code that you add to this project. We use Jest for unit tests and React Testing Library for component tests. Please make sure that your tests cover both the happy path and edge cases.

## Git Commits

When you make git commits, please make sure that you follow the conventional commits format. This means that your commit messages should start with a type like feat:, fix:, chore:, docs:, etc. This helps us to automatically generate changelogs and determine version bumps.

## Security

It is really important that you always think about security when writing code. Please make sure that you never expose sensitive information like API keys or passwords in the code. Use environment variables for sensitive configuration and make sure that they are properly validated.
`;

const BLOATED_SKILL_MD = `# Refactoring Assistant Skill

## Purpose

This skill is used to help with refactoring code in a systematic and safe manner. It provides guidance on how to identify code smells, plan refactoring operations, and execute them without introducing bugs or changing the behavior of the code.

## When to Use This Skill

You should use this skill whenever the user asks you to refactor code, clean up code, improve code quality, reduce complexity, or address technical debt. It is also useful when the user wants to extract a function, rename variables, or restructure modules.

## How to Perform Refactoring

When you are performing a refactoring, please follow these steps carefully and in order:

1. First, understand what the code is currently doing. Read through the code carefully and make sure that you understand the intent before making any changes.

2. Identify refactoring opportunities. Look for things like duplicated code, long functions, deeply nested code, unclear variable names, magic numbers, and other common code smells.

3. Plan the refactoring. Before making any changes, think through what you want to do and how you will verify that the behavior is preserved after the changes are made.

4. Make incremental changes. Please do not try to do everything at once. Make small changes and verify that tests still pass after each change.

5. Update tests as needed. If the refactoring changes the internal structure of the code, you may need to update the tests to match the new structure.

## Important Notes

It is really important that you never change the behavior of the code when refactoring. Refactoring is about improving the structure of the code, not about changing what it does. If you need to change the behavior, that should be done as a separate change in a different commit.
`;

// ─── Setup demo project ────────────────────────────────────────────────────

function setupDemoProject(root) {
  write(path.join(root, 'CLAUDE.md'), BLOATED_CLAUDE_MD);
  write(path.join(root, '.github', 'copilot-instructions.md'), BLOATED_COPILOT_INSTRUCTIONS);
  write(path.join(root, '.claude', 'skills', 'refactor', 'SKILL.md'), BLOATED_SKILL_MD);
  write(path.join(root, '.claude', 'rules', 'conventions.md'), BLOATED_SKILL_MD); // reuse as rule file
  write(path.join(root, '.mcp.json'), JSON.stringify({
    mcpServers: {
      github: { command: 'npx' },
      filesystem: { command: 'mcp-fs' },
    },
  }));
  write(path.join(root, '.vscode', 'mcp.json'), JSON.stringify({
    servers: { github: { type: 'http' } },
  }));
}

// ─── Benchmark ─────────────────────────────────────────────────────────────

async function benchmark() {
  const root = mkTempDir('tokenizer-bench-');
  console.log(color(`\ntokenizer compression benchmark`, 'bold'));
  console.log(color(`${'='.repeat(60)}\n`, 'gray'));
  console.log(`demo project: ${root}\n`);

  try {
    // Phase 1: setup
    setupDemoProject(root);

    // Phase 2: audit BEFORE compression
    const beforeScan = await scanProject(root);
    const beforeMcp = scanMcpConfig(root);

    console.log(color('── BEFORE compression ──', 'cyan'));
    console.log(`\nagent config files (compressible):`);
    let beforeConfigTotal = 0;
    for (const f of beforeScan.files) {
      console.log(`  ${f.relativePath.padEnd(50)} ${String(f.tokens).padStart(5)} tokens  [${f.severity}]`);
      beforeConfigTotal += f.tokens;
    }
    console.log(`  ${'─'.repeat(50)}`);
    console.log(`  ${'subtotal (configs):'.padEnd(50)} ${String(beforeConfigTotal).padStart(5)} tokens`);

    console.log(`\nMCP servers (NOT compressible — external schemas):`);
    let mcpTotal = 0;
    for (const s of beforeMcp.servers) {
      console.log(`  ${(s.agent + ':' + s.name).padEnd(50)} ${String(s.totalTokens).padStart(5)} tokens`);
      mcpTotal += s.totalTokens;
    }
    console.log(`  ${'─'.repeat(50)}`);
    console.log(`  ${'subtotal (MCP):'.padEnd(50)} ${String(mcpTotal).padStart(5)} tokens`);

    const beforeGrandTotal = beforeConfigTotal + mcpTotal;
    console.log(`\n  ${color('grand total (before):'.padEnd(50), 'bold')} ${color(String(beforeGrandTotal).padStart(5) + ' tokens', 'yellow')}`);

    // Phase 3: compress all config files
    console.log(color('\n── COMPRESSING ──', 'cyan'));
    const results = [];
    for (const f of beforeScan.files) {
      try {
        const r = compressFile(f.path, { level: 'full' });
        results.push({ ...r, relativePath: f.relativePath });
        console.log(`  ${f.relativePath.padEnd(45)} ${String(r.originalTokens).padStart(5)} → ${String(r.compressedTokens).padStart(5)} tokens  (${String(r.savings).padStart(2)}% saved)`);
      } catch (err) {
        console.log(`  ${f.relativePath}: ERROR ${err.message}`);
      }
    }

    // Phase 4: audit AFTER compression
    const afterScan = await scanProject(root);

    console.log(color('\n── AFTER compression ──', 'cyan'));
    console.log(`\nagent config files:`);
    let afterConfigTotal = 0;
    for (const f of afterScan.files) {
      console.log(`  ${f.relativePath.padEnd(50)} ${String(f.tokens).padStart(5)} tokens  [${f.severity}]`);
      afterConfigTotal += f.tokens;
    }
    console.log(`  ${'─'.repeat(50)}`);
    console.log(`  ${'subtotal (configs):'.padEnd(50)} ${String(afterConfigTotal).padStart(5)} tokens`);

    console.log(`\nMCP servers (unchanged):`);
    console.log(`  ${'subtotal (MCP):'.padEnd(50)} ${String(mcpTotal).padStart(5)} tokens`);

    const afterGrandTotal = afterConfigTotal + mcpTotal;
    console.log(`\n  ${color('grand total (after):'.padEnd(50), 'bold')} ${color(String(afterGrandTotal).padStart(5) + ' tokens', 'green')}`);

    // Phase 5: summary
    const configSavings = beforeConfigTotal > 0
      ? Math.round((1 - afterConfigTotal / beforeConfigTotal) * 100) : 0;
    const grandSavings = beforeGrandTotal > 0
      ? Math.round((1 - afterGrandTotal / beforeGrandTotal) * 100) : 0;
    const tokensSaved = beforeGrandTotal - afterGrandTotal;

    console.log(color('\n── SUMMARY ──', 'bold'));
    console.log(`  ${'config files:'.padEnd(35)} ${String(beforeConfigTotal).padStart(5)} → ${String(afterConfigTotal).padStart(5)} tokens  (${color(configSavings + '% saved', 'green')})`);
    console.log(`  ${'MCP schemas:'.padEnd(35)} ${String(mcpTotal).padStart(5)} tokens (not compressible)`);
    console.log(`  ${'total load per request:'.padEnd(35)} ${String(beforeGrandTotal).padStart(5)} → ${String(afterGrandTotal).padStart(5)} tokens  (${color(grandSavings + '% saved', 'green')})`);
    console.log(`  ${'tokens saved:'.padEnd(35)} ${color(String(tokensSaved), 'green')}`);

    // Extrapolation
    const sessionRequests = 50;
    const projected = tokensSaved * sessionRequests;
    console.log(`\n  over a ${sessionRequests}-request session → ${color('~' + projected.toLocaleString() + ' tokens saved', 'green')}`);

    console.log(color('\nnote: MCP schema load is fixed cost per session — prune unused servers to reduce.', 'gray'));
  } finally {
    rmDir(root);
    console.log(color(`\ncleaned up demo dir\n`, 'gray'));
  }
}

benchmark().catch(err => {
  console.error(color(`benchmark failed: ${err.message}`, 'red'));
  console.error(err.stack);
  process.exit(1);
});
