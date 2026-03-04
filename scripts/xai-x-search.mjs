#!/usr/bin/env node
/**
 * Search X/Twitter using xAI API directly via Node.js
 * Usage: node scripts/xai-x-search.mjs [@account] [days]
 */

const account = (process.argv[2] || 'aleabitoreddit').replace(/^@/, '');
const days = parseInt(process.argv[3] || '3');

const XAI_API_KEY = process.env.XAI_API_KEY;
if (!XAI_API_KEY) {
  console.error('❌ XAI_API_KEY environment variable not set');
  process.exit(1);
}

console.log(`🔍 Searching X for @${account} (last ${days} days)...`);
console.log(`   ⏳ This may take 1-2 minutes...`);

const startTime = Date.now();

const payload = {
  model: 'grok-4-0709',
  input: [{
    role: 'user',
    content: `List all stock tickers mentioned by @${account} in the last ${days} days. Format each as: $TICKER: Bullish/Bearish - brief reason`
  }],
  tools: [{ type: 'x_search' }],
  store: false
};

try {
  const response = await fetch('https://api.x.ai/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${XAI_API_KEY}`
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(180000) // 3 minute timeout
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error (${response.status}): ${error}`);
  }

  const data = await response.json();
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  
  console.log(`   ✓ Response received in ${elapsed}s`);
  console.log();

  // Extract the message content
  for (const item of data.output || []) {
    if (item.type === 'message' && item.content) {
      for (const content of item.content) {
        if (content.type === 'output_text') {
          console.log('=' .repeat(60));
          console.log(`X SCAN RESULTS: @${account}`);
          console.log('='.repeat(60));
          console.log();
          console.log(content.text);
          
          // Show citations
          if (content.annotations?.length > 0) {
            console.log();
            console.log('Sources:');
            const urls = [...new Set(content.annotations.filter(a => a.type === 'url_citation').map(a => a.url))];
            urls.slice(0, 5).forEach((url, i) => {
              console.log(`  ${i + 1}. ${url}`);
            });
          }
        }
      }
    }
  }

  // Show usage
  if (data.usage) {
    console.log();
    console.log(`Tokens: ${data.usage.input_tokens} in / ${data.usage.output_tokens} out`);
    if (data.usage.server_side_tool_usage_details) {
      console.log(`X searches: ${data.usage.server_side_tool_usage_details.x_search_calls || 0}`);
    }
  }

} catch (error) {
  if (error.name === 'TimeoutError') {
    console.error('⚠️  Request timed out after 3 minutes');
    console.error('   The xAI API may be rate-limited. Try again later.');
  } else {
    console.error('❌ Error:', error.message);
  }
  process.exit(1);
}
