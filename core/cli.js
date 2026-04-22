#!/usr/bin/env node

/**
 * cli.js — tokenizer CLI
 *
 * Usage:
 *   node core/cli.js audit [dir]              # scan + report token usage
 *   node core/cli.js compress <file>          # compress a file (backs up original)
 *   node core/cli.js compress --all [dir]     # compress all detected config files
 *   node core/cli.js compress --dry-run <f>   # preview without writing
 *   node core/cli.js restore <file>           # restore from .original backup
 *   node core/cli.js list [dir]               # list detected config files
 */

const fs = require('fs');
const path = require('path');
const { scanProject, estimateTokens } = require('./scanner');
const { compress, compressFile, restoreFile } = require('./compressor');
const { scanMcpConfig } = require('./mcp');
const { writeFingerprint, generateFingerprint, renderMarkdown } = require('./fingerprint');
const { wireFingerprint, unwireFingerprint } = require('./integrations');

function cmdAudit(dir) {
  const projectDir = path.resolve(dir || process.cwd());
  console.log(`tokenizer audit\n================\n`);
  console.log(`scanning: ${projectDir}\n`);

  scanProject(projectDir).then(({ files, byAgent, totalTokens, recommendations }) => {
    let grandTotal = totalTokens;
    const allRecommendations = [...recommendations];

    if (files.length === 0) {
      console.log('no agent config files detected.\n');
    } else {
      for (const [agent, list] of Object.entries(byAgent)) {
        console.log(`${agent}:`);
        for (const f of list) {
          const pad = Math.max(0, 45 - f.relativePath.length);
          const padStr = ' '.repeat(pad);
          console.log(`  ${f.relativePath}${padStr}~${f.tokens} tokens  ${f.severity}`);
        }
        console.log('');
      }
    }

    // MCP audit section — group by agent (claude, copilot)
    const mcp = scanMcpConfig(projectDir);
    if (mcp.servers.length > 0) {
      const byAgentMcp = {};
      for (const s of mcp.servers) {
        (byAgentMcp[s.agent] = byAgentMcp[s.agent] || []).push(s);
      }
      for (const [agent, list] of Object.entries(byAgentMcp)) {
        console.log(`MCP (${agent}):`);
        for (const s of list) {
          const pad = Math.max(0, 40 - s.name.length);
          const padStr = ' '.repeat(pad);
          const severity = s.totalTokens > 3000 ? 'HEAVY' : s.totalTokens > 1000 ? 'OK' : 'LIGHT';
          console.log(`  ${s.name}${padStr}~${s.totalTokens} tokens  ${severity}  [${s.scope}]`);
        }
        console.log('');
      }
      grandTotal += mcp.totalTokens;
      allRecommendations.push(...mcp.recommendations);
    }

    console.log(`total context overhead: ~${grandTotal} tokens/request\n`);

    if (allRecommendations.length > 0) {
      console.log('recommendations:');
      for (const rec of allRecommendations) {
        console.log(`  - ${rec}`);
      }
    } else {
      console.log('no bloat detected — looking good.');
    }
  });
}

function cmdCompress(args) {
  if (args.includes('--all')) {
    const dirArg = args.find(a => !a.startsWith('--'));
    const projectDir = path.resolve(dirArg || process.cwd());
    const level = args.includes('--ultra') ? 'ultra' : args.includes('--lite') ? 'lite' : 'full';
    const structured = args.includes('--structured');
    const opts = { level, structured };

    scanProject(projectDir).then(({ files }) => {
      if (files.length === 0) {
        console.log('no agent config files detected.');
        return;
      }

      let totalBefore = 0, totalAfter = 0;
      const isDryRun = args.includes('--dry-run');

      console.log(`${isDryRun ? 'DRY RUN — ' : ''}compressing ${files.length} file(s) [level=${level}${structured ? ', structured' : ''}]...\n`);

      for (const f of files) {
        if (isDryRun) {
          const { originalTokens, compressedTokens, savings } = compress(f.content, opts);
          totalBefore += originalTokens;
          totalAfter += compressedTokens;
          console.log(`  ${f.relativePath}: ${originalTokens} → ${compressedTokens} tokens (${savings}% saved)`);
        } else {
          try {
            const result = compressFile(f.path, opts);
            totalBefore += result.originalTokens;
            totalAfter += result.compressedTokens;
            console.log(`  ${f.relativePath}: ${result.originalTokens} → ${result.compressedTokens} tokens (${result.savings}% saved)`);
          } catch (err) {
            console.log(`  ${f.relativePath}: ERROR — ${err.message}`);
          }
        }
      }

      const totalSavings = totalBefore > 0 ? Math.round((1 - totalAfter / totalBefore) * 100) : 0;
      console.log(`\ntotal: ${totalBefore} → ${totalAfter} tokens (${totalSavings}% saved)`);
      if (isDryRun) console.log('(dry run — no files changed)');
    });
    return;
  }

  const isDryRun = args.includes('--dry-run');
  const level = args.includes('--ultra') ? 'ultra' : args.includes('--lite') ? 'lite' : 'full';
  const structured = args.includes('--structured');
  const filePath = args.find(a => !a.startsWith('--'));

  if (!filePath) {
    console.log('usage: compress <file> [--dry-run] [--lite|--ultra]');
    return;
  }

  try {
    if (isDryRun) {
      const content = fs.readFileSync(filePath, 'utf8');
      const { originalTokens, compressedTokens, savings, compressed } = compress(content, { level, structured });
      console.log(`DRY RUN — ${filePath}`);
      console.log(`  original:   ${originalTokens} tokens`);
      console.log(`  compressed: ${compressedTokens} tokens`);
      console.log(`  savings:    ${savings}%`);
      console.log(`\n--- compressed preview ---`);
      console.log(compressed.slice(0, 500) + (compressed.length > 500 ? '...' : ''));
    } else {
      const result = compressFile(filePath, { level, structured });
      console.log(`compressed: ${filePath}`);
      console.log(`  backup:     ${result.backupPath}`);
      console.log(`  original:   ${result.originalTokens} tokens`);
      console.log(`  compressed: ${result.compressedTokens} tokens`);
      console.log(`  savings:    ${result.savings}%`);
    }
  } catch (err) {
    console.error(`error: ${err.message}`);
    process.exit(1);
  }
}

function cmdRestore(filePath) {
  if (!filePath) {
    console.log('usage: restore <file>');
    return;
  }
  try {
    const result = restoreFile(filePath);
    console.log(`restored: ${result.restored}`);
    console.log(`removed:  ${result.removed}`);
  } catch (err) {
    console.error(`error: ${err.message}`);
    process.exit(1);
  }
}

function cmdFingerprint(args) {
  const dirArg = args.find(a => !a.startsWith('--'));
  const projectDir = path.resolve(dirArg || process.cwd());
  const force = args.includes('--force');
  const dryRun = args.includes('--dry-run');
  const showOutput = args.includes('--print');
  const wire = args.includes('--wire');
  const unwire = args.includes('--unwire');

  if (unwire) {
    const result = unwireFingerprint(projectDir);
    console.log(`unwiring fingerprint from agents...\n`);
    if (result.claude) console.log(`  Claude   (CLAUDE.md): ${result.claude.status}`);
    if (result.copilot) console.log(`  Copilot  (copilot-instructions.md): ${result.copilot.status}`);
    return;
  }

  if (dryRun) {
    const fp = generateFingerprint(projectDir);
    const md = renderMarkdown(fp);
    console.log(`DRY RUN — fingerprint preview for ${projectDir}\n`);
    console.log(md);
    console.log(`\n~${Math.ceil(md.length / 4)} tokens (not written)`);
    return;
  }

  const result = writeFingerprint(projectDir, { force });
  if (result.status === 'cached') {
    console.log(`fingerprint unchanged (hash: ${result.hash})`);
    console.log(`  path: ${result.path}`);
    console.log(`  use --force to regenerate`);
  } else {
    console.log(`fingerprint generated: ${result.path}`);
    console.log(`  hash:   ${result.hash}`);
    console.log(`  files:  ${result.stats.totalFiles} (${result.stats.totalCodeFiles} code)`);
    console.log(`  size:   ~${result.tokens} tokens`);
    if (showOutput) {
      console.log(`\n---\n`);
      console.log(fs.readFileSync(result.path, 'utf8'));
    }
  }

  if (wire) {
    console.log(`\nwiring into agents...`);
    const w = wireFingerprint(projectDir);
    console.log(`  Claude   (CLAUDE.md): ${w.claude.status} → ${w.claude.path}`);
    console.log(`  Copilot  (.github/copilot-instructions.md): ${w.copilot.status} → ${w.copilot.path}`);
  }
}

function cmdMcp(args) {
  const dirArg = args.find(a => !a.startsWith('--'));
  const projectDir = path.resolve(dirArg || process.cwd());
  const result = scanMcpConfig(projectDir);

  console.log(`tokenizer MCP audit\n================\n`);

  if (result.servers.length === 0) {
    console.log('no MCP servers configured.');
    console.log('\nchecked locations:');
    console.log('  claude (project): .mcp.json, .claude/mcp.json, .claude/settings.json');
    console.log('  claude (user):    ~/.claude.json, ~/.claude/mcp.json');
    console.log('  copilot (project): .vscode/mcp.json, .vscode/settings.json');
    console.log('  copilot (user):    VS Code user settings.json (mcp.servers)');
    return;
  }

  // Group by agent for clearer reporting
  const byAgent = {};
  for (const s of result.servers) {
    (byAgent[s.agent] = byAgent[s.agent] || []).push(s);
  }
  for (const [agent, list] of Object.entries(byAgent)) {
    const agentTotal = list.reduce((sum, s) => sum + s.totalTokens, 0);
    console.log(`${agent} (${list.length} server${list.length === 1 ? '' : 's'}, ~${agentTotal} tokens):`);
    for (const s of list) {
      const pad = Math.max(0, 40 - s.name.length);
      const padStr = ' '.repeat(pad);
      console.log(`  ${s.name}${padStr}~${s.totalTokens} tokens  [${s.scope}] ${s.source}`);
    }
    console.log('');
  }
  console.log(`total MCP schema load: ~${result.totalTokens} tokens/session\n`);

  if (result.recommendations.length > 0) {
    console.log('recommendations:');
    for (const rec of result.recommendations) {
      console.log(`  - ${rec}`);
    }
  }
}

function cmdList(dir) {
  const projectDir = path.resolve(dir || process.cwd());
  scanProject(projectDir).then(({ files, byAgent }) => {
    if (files.length === 0) {
      console.log('no agent config files detected.');
      return;
    }
    console.log(`detected config files in ${projectDir}:\n`);
    for (const [agent, list] of Object.entries(byAgent)) {
      console.log(`${agent}: ${list.length} file(s)`);
      for (const f of list) {
        console.log(`  - ${f.relativePath} (~${f.tokens} tokens)`);
      }
    }
  });
}

function printHelp() {
  console.log(`
tokenizer CLI

commands:
  audit [dir]                scan + report token usage (incl. MCP servers)
  mcp [dir]                  audit MCP server config only
  fingerprint [dir]          generate/update codebase fingerprint cache
  fingerprint --force        force regeneration
  fingerprint --dry-run      preview without writing
  fingerprint --print        print fingerprint after writing
  fingerprint --wire         also wire into Claude + Copilot config files
  fingerprint --unwire       remove fingerprint reference from Claude + Copilot
  compress <file>            compress a file (backs up original)
  compress --all [dir]       compress all detected config files
  compress --dry-run <file>  preview compression without writing
  compress --lite|--ultra    choose compression intensity (default: full)
  compress --structured      also apply structural transform (prose → bullets)
  restore <file>             restore from .original backup
  list [dir]                 list detected config files

examples:
  node core/cli.js audit
  node core/cli.js fingerprint
  node core/cli.js mcp
  node core/cli.js compress ./CLAUDE.md
  node core/cli.js compress --all --dry-run
  node core/cli.js restore ./CLAUDE.md
  `);
}

// ── main ──
const args = process.argv.slice(2);
const cmd = args[0];
const rest = args.slice(1);

switch (cmd) {
  case 'audit': cmdAudit(rest[0]); break;
  case 'mcp': cmdMcp(rest); break;
  case 'fingerprint': cmdFingerprint(rest); break;
  case 'compress': cmdCompress(rest); break;
  case 'restore': cmdRestore(rest[0]); break;
  case 'list': cmdList(rest[0]); break;
  case 'help':
  case '--help':
  case '-h':
  case undefined:
    printHelp();
    break;
  default:
    console.error(`unknown command: ${cmd}`);
    printHelp();
    process.exit(1);
}
