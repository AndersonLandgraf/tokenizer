/**
 * mcp.js — MCP (Model Context Protocol) config scanner
 *
 * Scans MCP configuration files for configured servers + estimates token
 * cost of their schemas (tool descriptions, input schemas) that load into
 * every Claude session.
 *
 * MCP tool schemas are hidden token tax — most users never audit them.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Known MCP config locations, in priority order.
// Each: { rel|abs, scope, agent, key? }
//   key = optional nested key containing server map (eg settings.json → "mcpServers")
const MCP_CONFIG_LOCATIONS = [
  // Claude Code (project-scoped)
  { rel: '.mcp.json', scope: 'project', agent: 'claude' },
  { rel: '.claude/mcp.json', scope: 'project', agent: 'claude' },
  { rel: '.claude/settings.json', scope: 'project', agent: 'claude', key: 'mcpServers' },
  { rel: '.claude/settings.local.json', scope: 'project', agent: 'claude', key: 'mcpServers' },

  // GitHub Copilot / VS Code (project-scoped)
  // VS Code MCP support landed in 1.98 (Feb 2025).
  { rel: '.vscode/mcp.json', scope: 'project', agent: 'copilot', key: 'servers' },
  { rel: '.vscode/settings.json', scope: 'project', agent: 'copilot', key: 'mcp.servers' },
];

function userSettingsJsonPath() {
  // VS Code user settings.json — platform dependent
  const home = os.homedir();
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Code', 'User', 'settings.json');
  }
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'Code', 'User', 'settings.json');
  }
  return path.join(home, '.config', 'Code', 'User', 'settings.json');
}

const USER_MCP_LOCATIONS = [
  // Claude (user-scope)
  { abs: path.join(os.homedir(), '.claude.json'), scope: 'user', agent: 'claude', key: 'mcpServers' },
  { abs: path.join(os.homedir(), '.claude', 'mcp.json'), scope: 'user', agent: 'claude' },
  { abs: path.join(os.homedir(), '.claude', 'settings.json'), scope: 'user', agent: 'claude', key: 'mcpServers' },

  // Copilot / VS Code (user-scope)
  { abs: userSettingsJsonPath(), scope: 'user', agent: 'copilot', key: 'mcp.servers' },
];

function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

function readJson(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Extract MCP server definitions from a config file.
 * Supports:
 *   - top-level `mcpServers` / `servers`
 *   - nested key path ("mcp.servers")
 *   - raw map at root
 */
function extractServers(config, key) {
  if (!config) return {};
  if (!key) return config.mcpServers || config.servers || config;
  // Flat literal key first (VS Code settings.json uses dotted literals like "mcp.servers")
  if (config[key] && typeof config[key] === 'object') return config[key];
  // Then dotted path traversal (nested object form)
  const parts = key.split('.');
  let cur = config;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return {};
    cur = cur[p];
  }
  return cur || {};
}

/**
 * Classify a server by token cost.
 * Since we can't live-query tool schemas without spawning the server,
 * we estimate based on config verbosity as a proxy.
 */
function classifyServer(serverDef) {
  const json = JSON.stringify(serverDef);
  const tokens = estimateTokens(json);
  return {
    configTokens: tokens,
    configSize: json.length,
  };
}

/**
 * Estimate schema load cost for a single server.
 * Uses known heuristics:
 *   - Config complexity as proxy for tool count
 *   - Common server names map to known tool counts
 */
const KNOWN_SERVER_TOOL_COUNTS = {
  filesystem: 11,
  git: 15,
  github: 26,
  gitlab: 9,
  slack: 8,
  memory: 4,
  'brave-search': 2,
  everart: 1,
  fetch: 1,
  puppeteer: 7,
  sqlite: 6,
  postgres: 2,
  'google-drive': 2,
  'google-maps': 7,
  'sequential-thinking': 1,
  time: 2,
};

function estimateToolSchemaTokens(serverName, serverDef) {
  const normalized = serverName.toLowerCase().replace(/[^a-z0-9-]/g, '');

  // Exact match first (avoid substring collisions like "git" matching "github")
  if (KNOWN_SERVER_TOOL_COUNTS[normalized] != null) {
    return KNOWN_SERVER_TOOL_COUNTS[normalized] * 350;
  }

  // Prefer longer keys when substring-matching, so "github" beats "git"
  const sortedKnown = Object.entries(KNOWN_SERVER_TOOL_COUNTS)
    .sort(([a], [b]) => b.length - a.length);

  for (const [known, count] of sortedKnown) {
    if (normalized.includes(known)) {
      return count * 350;
    }
  }

  // Unknown server — conservative estimate
  return 2500;
}

/**
 * Scan all MCP config files + return structured report.
 *
 * Returns: {
 *   servers: [{ name, source, configTokens, estimatedSchemaTokens, totalTokens }],
 *   totalTokens: number,
 *   totalConfigTokens: number,
 *   sources: string[],
 *   recommendations: string[],
 * }
 */
function scanMcpConfig(projectDir) {
  projectDir = path.resolve(projectDir || process.cwd());
  const servers = [];
  const sources = [];

  // Project-scope configs
  for (const loc of MCP_CONFIG_LOCATIONS) {
    const absPath = path.join(projectDir, loc.rel);
    if (!fs.existsSync(absPath)) continue;
    const config = readJson(absPath);
    if (!config) continue;

    const serverMap = extractServers(config, loc.key);
    const serverNames = Object.keys(serverMap);
    if (serverNames.length === 0) continue;

    sources.push(`${loc.agent}:${loc.rel}`);

    for (const name of serverNames) {
      const def = serverMap[name];
      const { configTokens } = classifyServer(def);
      const schemaTokens = estimateToolSchemaTokens(name, def);
      servers.push({
        name,
        agent: loc.agent,
        source: loc.rel,
        scope: loc.scope,
        configTokens,
        estimatedSchemaTokens: schemaTokens,
        totalTokens: schemaTokens,
      });
    }
  }

  // User-scope configs
  for (const loc of USER_MCP_LOCATIONS) {
    if (!fs.existsSync(loc.abs)) continue;
    const config = readJson(loc.abs);
    if (!config) continue;

    const serverMap = extractServers(config, loc.key);
    const serverNames = Object.keys(serverMap);
    if (serverNames.length === 0) continue;

    const relSource = loc.abs.replace(os.homedir(), '~');
    sources.push(`${loc.agent}:${relSource}`);

    for (const name of serverNames) {
      // Dedupe only when same agent already loaded same server at project scope
      if (servers.find(s => s.name === name && s.agent === loc.agent)) continue;

      const def = serverMap[name];
      const { configTokens } = classifyServer(def);
      const schemaTokens = estimateToolSchemaTokens(name, def);
      servers.push({
        name,
        agent: loc.agent,
        source: relSource,
        scope: 'user',
        configTokens,
        estimatedSchemaTokens: schemaTokens,
        totalTokens: schemaTokens,
      });
    }
  }

  const totalTokens = servers.reduce((sum, s) => sum + s.totalTokens, 0);
  const totalConfigTokens = servers.reduce((sum, s) => sum + s.configTokens, 0);

  const recommendations = [];
  if (servers.length > 10) {
    recommendations.push(`${servers.length} MCP servers registered — disable unused ones to cut schema load`);
  }
  const heavy = servers.filter(s => s.totalTokens > 3000);
  for (const s of heavy) {
    recommendations.push(`MCP server "${s.name}" loads ~${s.totalTokens} tokens — disable if not used often`);
  }
  if (totalTokens > 15000) {
    recommendations.push(`Total MCP schema load ~${totalTokens} tokens — consider project-scoped .mcp.json with only needed servers`);
  }

  return {
    servers,
    totalTokens,
    totalConfigTokens,
    sources,
    recommendations,
  };
}

module.exports = {
  scanMcpConfig,
  estimateToolSchemaTokens,
  KNOWN_SERVER_TOOL_COUNTS,
};
