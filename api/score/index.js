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

  // Retry transient Anthropic errors (overload / rate-limit / 5xx) with
  // jittered exponential backoff. Fixed schedule keeps total added latency
  // bounded well under the SWA Free plan function timeout.
  const RETRY_DELAYS_MS = [500, 1500, 3500];
  const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504, 529]);

  try {
    let result;
    let attempt = 0;
    while (true) {
      result = await callAnthropic(payload, KEY);

      if (!RETRYABLE_STATUS.has(result.status) || attempt >= RETRY_DELAYS_MS.length) {
        break;
      }

      const delay = RETRY_DELAYS_MS[attempt] + Math.floor(Math.random() * 250);
      context.log.warn(
        `Anthropic returned ${result.status}; retrying in ${delay}ms (attempt ${attempt + 1}/${RETRY_DELAYS_MS.length})`
      );
      await sleep(delay);
      attempt++;
    }

    context.res = { status: result.status, headers, body: result.body };
  } catch (err) {
    context.log.error('Anthropic proxy error:', err.message);
    context.res = {
      status: 502, headers,
      body: JSON.stringify({ error: 'Upstream API request failed', detail: err.message })
    };
  }
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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
