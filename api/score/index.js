/**
 * Prompt League — Azure Function (score)
 *
 * Proxies scoring requests from the browser to the Anthropic API.
 * The API key lives in Azure Application Settings — never in the browser.
 *
 * Endpoint: POST /api/score
 *
 * Deployed via Azure Static Web Apps — CORS is handled automatically
 * because the function and the HTML share the same domain.
 */

const https = require('https');

module.exports = async function (context, req) {

  const headers = { 'Content-Type': 'application/json' };

  // Handle preflight
  if (req.method === 'OPTIONS') {
    context.res = { status: 200, headers, body: '' };
    return;
  }

  // API key from Application Settings
  const KEY = process.env.ANTHROPIC_API_KEY;
  if (!KEY) {
    context.res = {
      status: 503, headers,
      body: JSON.stringify({
        error: 'ANTHROPIC_API_KEY is not configured. Add it in Azure Portal → Static Web App → Configuration.'
      })
    };
    return;
  }

  // Validate request
  const { model, max_tokens, system, messages } = req.body || {};
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    context.res = {
      status: 400, headers,
      body: JSON.stringify({ error: 'messages array is required' })
    };
    return;
  }

  // Proxy to Anthropic
  const payload = JSON.stringify({
    model:      model      || 'claude-sonnet-4-6',
    max_tokens: max_tokens || 1000,
    system,
    messages,
  });

  try {
    const result = await callAnthropic(payload, KEY);
    context.res = { status: result.status, headers, body: result.body };
  } catch (err) {
    context.log.error('Anthropic proxy error:', err.message);
    context.res = {
      status: 502, headers,
      body: JSON.stringify({ error: 'Upstream API request failed', detail: err.message })
    };
  }
};

function callAnthropic(payload, key) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.anthropic.com',
      path:     '/v1/messages',
      method:   'POST',
      headers: {
        'Content-Type':      'application/json',
        'Content-Length':    Buffer.byteLength(payload),
        'x-api-key':         key,
        'anthropic-version': '2023-06-01',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}
