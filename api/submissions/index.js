/**
 * Prompt League — Azure Function (submissions)
 *
 * Persists one scoring submission to Azure Table Storage.
 *
 * Endpoint: POST /api/submissions
 *
 * PartitionKey: s{season}w{week}  (enables efficient weekly queries)
 * RowKey:       {paddedTimestamp}-{randomSuffix}  (chronological + unique)
 */

const { getTableClient, ensureTable } = require('../shared/tables');

// Guardrails — Table Storage allows ~64KB per string property, but capping
// much lower keeps entities small and prevents abuse.
const MAX_USER_LEN     = 80;
const MAX_DEPT_LEN     = 80;
const MAX_PROMPT_LEN   = 8000;
const MAX_RESPONSE_LEN = 16000;

module.exports = async function (context, req) {
  const headers = { 'Content-Type': 'application/json' };

  if (req.method === 'OPTIONS') {
    context.res = { status: 200, headers, body: '' };
    return;
  }

  if (!process.env.TABLES_CONNECTION_STRING) {
    context.res = {
      status: 503, headers,
      body: JSON.stringify({
        error: 'TABLES_CONNECTION_STRING is not configured. Add it in Azure Portal → Static Web App → Configuration.'
      })
    };
    return;
  }

  const body = req.body || {};
  const user    = String(body.user || '').trim().slice(0, MAX_USER_LEN);
  const dept    = String(body.dept || '—').trim().slice(0, MAX_DEPT_LEN);
  const week    = Number(body.week);
  const season  = Number(body.season);
  const prompt  = String(body.prompt || '').slice(0, MAX_PROMPT_LEN);
  const response_text = body.response_text
    ? String(body.response_text).slice(0, MAX_RESPONSE_LEN)
    : null;
  const result = body.result;

  if (
    !user ||
    !Number.isFinite(week) ||
    !Number.isFinite(season) ||
    !result ||
    typeof result.total !== 'number' ||
    !result.grade
  ) {
    context.res = {
      status: 400, headers,
      body: JSON.stringify({ error: 'Missing or invalid fields: user, week, season, result.total, result.grade are required' })
    };
    return;
  }

  try {
    await ensureTable(context);
    const client = getTableClient();

    const now = new Date();
    // 15-char zero-padded ms timestamp keeps rows sorted chronologically
    // within a partition; random suffix prevents collisions on bursty writes.
    const rowKey = `${String(now.getTime()).padStart(15, '0')}-${Math.random().toString(36).slice(2, 8)}`;
    const partitionKey = `s${season}w${week}`;

    await client.createEntity({
      partitionKey,
      rowKey,
      user,
      dept,
      week,
      season,
      prompt,
      response_text,
      total:  Math.round(result.total),
      grade:  String(result.grade),
      scores: JSON.stringify(result.scores || {}),
      submittedAt: now.toISOString(),
    });

    context.res = { status: 201, headers, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    context.log.error('submissions insert failed:', err.message);
    context.res = {
      status: 500, headers,
      body: JSON.stringify({ error: 'Failed to persist submission', detail: err.message })
    };
  }
};
