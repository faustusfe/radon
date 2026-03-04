#!/usr/bin/env node
/**
 * Quick script to call xAI MCP server's live_search tool
 * Usage: node scripts/xai-search.mjs "@aleabitoreddit" 3
 */

import { spawn } from 'child_process';

const account = process.argv[2] || 'aleabitoreddit';
const days = parseInt(process.argv[3] || '3');

// Remove @ if present
const cleanAccount = account.replace(/^@/, '');

console.log(`🔍 Searching X for @${cleanAccount} (last ${days} days) via MCP...`);

// Start the MCP server
const server = spawn('xai-mcp-server', [], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env }
});

let buffer = '';
let requestId = 1;

// Handle server output
server.stdout.on('data', (data) => {
  buffer += data.toString();
  
  // Try to parse complete JSON-RPC messages
  const lines = buffer.split('\n');
  buffer = lines.pop() || ''; // Keep incomplete line in buffer
  
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      handleResponse(msg);
    } catch (e) {
      // Not valid JSON, might be log output
      if (line.includes('error')) {
        console.error('Server:', line);
      }
    }
  }
});

server.stderr.on('data', (data) => {
  const msg = data.toString().trim();
  if (msg && !msg.includes('running on stdio')) {
    console.error('MCP stderr:', msg);
  }
});

server.on('close', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`MCP server exited with code ${code}`);
  }
});

// Send JSON-RPC message
function send(method, params = {}) {
  const msg = {
    jsonrpc: '2.0',
    id: requestId++,
    method,
    params
  };
  server.stdin.write(JSON.stringify(msg) + '\n');
}

// Handle responses
function handleResponse(msg) {
  if (msg.error) {
    console.error('Error:', msg.error.message || msg.error);
    server.kill();
    process.exit(1);
  }
  
  if (msg.result) {
    // Check what kind of result this is
    if (msg.result.tools) {
      // This is the tools/list response
      console.log(`   Found ${msg.result.tools.length} tools`);
      // Now call live_search
      callLiveSearch();
    } else if (msg.result.content) {
      // This is the tool call response
      const content = msg.result.content[0];
      if (content && content.text) {
        try {
          const result = JSON.parse(content.text);
          displayResults(result);
        } catch (e) {
          console.log('\nRaw response:');
          console.log(content.text);
        }
      }
      server.kill();
    }
  }
}

function callLiveSearch() {
  console.log('   Calling live_search...');
  
  const query = `List all stock tickers mentioned by @${cleanAccount} in the last ${days} days. Format: $TICKER: Bullish/Bearish`;
  
  send('tools/call', {
    name: 'live_search',
    arguments: {
      query: query,
      sources: ['x'],
      max_results: 20
    }
  });
}

function displayResults(result) {
  console.log('\n' + '='.repeat(60));
  console.log(`X SCAN RESULTS: @${cleanAccount}`);
  console.log('='.repeat(60));
  
  if (!result.success) {
    console.log('❌ Search failed:', result.error);
    return;
  }
  
  console.log('\nContent:');
  console.log(result.content);
  
  if (result.citations && result.citations.length > 0) {
    console.log('\nSources:');
    result.citations.slice(0, 5).forEach((c, i) => {
      console.log(`  ${i + 1}. ${c.url}`);
    });
  }
  
  if (result.tool_usage) {
    console.log(`\nAPI calls: ${result.tool_usage.x_search_calls || 0} x_search`);
  }
}

// Start by listing tools to verify connection
console.log('   Connecting to MCP server...');
send('initialize', {
  protocolVersion: '2024-11-05',
  capabilities: {},
  clientInfo: { name: 'xai-search-cli', version: '1.0.0' }
});

// After init, list tools then call
setTimeout(() => {
  send('tools/list', {});
}, 500);

// Timeout after 3 minutes
setTimeout(() => {
  console.log('\n⚠️  Timeout after 3 minutes');
  server.kill();
  process.exit(1);
}, 180000);
