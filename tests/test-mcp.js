const assert = require('assert');
const path = require('path');
const { scanMcpConfig, estimateToolSchemaTokens } = require('../core/mcp');
const { mkTempDir, rmDir, write } = require('./helpers');

module.exports = {
  'mcp: no config returns empty'() {
    const tmp = mkTempDir();
    try {
      const result = scanMcpConfig(tmp);
      assert.strictEqual(result.servers.length, 0);
      assert.strictEqual(result.totalTokens, 0);
    } finally {
      rmDir(tmp);
    }
  },

  'mcp: parses .mcp.json'() {
    const tmp = mkTempDir();
    try {
      write(path.join(tmp, '.mcp.json'), JSON.stringify({
        mcpServers: {
          github: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] },
          filesystem: { command: 'mcp-fs', args: ['/some/dir'] },
        },
      }));
      const result = scanMcpConfig(tmp);
      assert.strictEqual(result.servers.length, 2, '2 servers parsed');
      assert.ok(result.servers.find(s => s.name === 'github'), 'github found');
      assert.ok(result.servers.find(s => s.name === 'filesystem'), 'filesystem found');
      assert.ok(result.totalTokens > 0, 'tokens estimated');
    } finally {
      rmDir(tmp);
    }
  },

  'mcp: parses Copilot .vscode/mcp.json (servers key)'() {
    const tmp = mkTempDir();
    try {
      write(path.join(tmp, '.vscode', 'mcp.json'), JSON.stringify({
        servers: {
          github: { type: 'http', url: 'https://api.githubcopilot.com/mcp/' },
          postgres: { command: 'mcp-postgres' },
        },
      }));
      const result = scanMcpConfig(tmp);
      const github = result.servers.find(s => s.name === 'github');
      const postgres = result.servers.find(s => s.name === 'postgres');
      assert.ok(github, 'github server found (copilot)');
      assert.strictEqual(github.agent, 'copilot');
      assert.strictEqual(github.source, '.vscode/mcp.json');
      assert.ok(postgres, 'postgres found');
    } finally {
      rmDir(tmp);
    }
  },

  'mcp: parses Copilot .vscode/settings.json mcp.servers (dotted key)'() {
    const tmp = mkTempDir();
    try {
      write(path.join(tmp, '.vscode', 'settings.json'), JSON.stringify({
        'mcp.servers': {
          slack: { command: 'mcp-slack' },
        },
      }));
      const result = scanMcpConfig(tmp);
      const slack = result.servers.find(s => s.name === 'slack');
      assert.ok(slack, 'slack server found');
      assert.strictEqual(slack.agent, 'copilot');
    } finally {
      rmDir(tmp);
    }
  },

  'mcp: Claude + Copilot same-named server counted separately'() {
    const tmp = mkTempDir();
    try {
      // Both agents configure "github" — each should be reported
      write(path.join(tmp, '.mcp.json'), JSON.stringify({
        mcpServers: { github: { command: 'npx' } },
      }));
      write(path.join(tmp, '.vscode', 'mcp.json'), JSON.stringify({
        servers: { github: { type: 'http' } },
      }));
      const result = scanMcpConfig(tmp);
      const githubServers = result.servers.filter(s => s.name === 'github');
      assert.strictEqual(githubServers.length, 2, 'one per agent');
      const agents = new Set(githubServers.map(s => s.agent));
      assert.ok(agents.has('claude') && agents.has('copilot'), 'both agents present');
    } finally {
      rmDir(tmp);
    }
  },

  'mcp: parses .claude/settings.json mcpServers key'() {
    const tmp = mkTempDir();
    try {
      write(path.join(tmp, '.claude', 'settings.json'), JSON.stringify({
        mcpServers: { memory: { command: 'mcp-memory' } },
      }));
      const result = scanMcpConfig(tmp);
      const server = result.servers.find(s => s.name === 'memory');
      assert.ok(server, 'memory server found via settings.json');
      assert.strictEqual(server.source, '.claude/settings.json');
    } finally {
      rmDir(tmp);
    }
  },

  'mcp: estimateToolSchemaTokens — known server'() {
    const githubTokens = estimateToolSchemaTokens('github', {});
    const unknownTokens = estimateToolSchemaTokens('totally-unknown-server-xyz', {});
    assert.ok(githubTokens > 0);
    assert.ok(unknownTokens > 0);
    // github has 26 tools @ 350 each = 9100
    assert.strictEqual(githubTokens, 26 * 350);
  },

  'mcp: flags heavy servers'() {
    const tmp = mkTempDir();
    try {
      write(path.join(tmp, '.mcp.json'), JSON.stringify({
        mcpServers: {
          github: { command: 'npx' }, // heavy — 9100 tokens
          memory: { command: 'mcp-memory' }, // light — 1400 tokens
        },
      }));
      const result = scanMcpConfig(tmp);
      const heavy = result.recommendations.find(r => r.includes('github'));
      assert.ok(heavy, 'github flagged as heavy');
    } finally {
      rmDir(tmp);
    }
  },

  'mcp: totals across multiple sources'() {
    const tmp = mkTempDir();
    try {
      write(path.join(tmp, '.mcp.json'), JSON.stringify({
        mcpServers: { filesystem: { command: 'mcp-fs' } },
      }));
      write(path.join(tmp, '.claude', 'mcp.json'), JSON.stringify({
        mcpServers: { git: { command: 'mcp-git' } },
      }));
      const result = scanMcpConfig(tmp);
      assert.ok(result.servers.length >= 2);
      assert.ok(result.totalTokens > 0);
    } finally {
      rmDir(tmp);
    }
  },
};
