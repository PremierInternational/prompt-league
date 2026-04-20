/**
 * Prompt League — Azure Function (leaderboard)
 *
 * Reads submissions from Azure Table Storage and returns a ranked list.
 *
 * Endpoint: GET /api/leaderboard?view={weekly|quarterly|alltime}&week=N&season=N
 *
 * Ranking rules:
 *   weekly    — one row per user: their best score that (season, week).
 *   quarterly — one row per user in that season: SUM of their best score per
 *               week played. weeks_played = distinct weeks they submitted.
 *   alltime   — same aggregation across all seasons.
 *
 * For quarterly/alltime the grade is derived from the user's AVERAGE score
 * per week (total / weeks_played), since summing 4 B's would otherwise show
 * as an "A"-tier total.
 */

const { getTableClient, ensureTable } = require('../shared/tables');

function gradeFromAvg(avg) {
  if (avg >= 90) return 'A';
  if (avg >= 80) return 'B';
  if (avg >= 70) return 'C';
  return 'D';
}

module.exports = async function (context, req) {
  const headers = { 'Content-Type': 'application/json' };

  if (req.method === 'OPTIONS') {
    context.res = { status: 200, headers, body: '' };
    return;
  }

  // If storage isn't configured yet, return an empty leaderboard instead of
  // 500 so the UI still loads cleanly.
  if (!process.env.TABLES_CONNECTION_STRING) {
    context.res = { status: 200, headers, body: JSON.stringify({ rows: [] }) };
    return;
  }

  const view   = (req.query?.view || 'weekly').toLowerCase();
  const week   = Number(req.query?.week);
  const season = Number(req.query?.season);

  try {
    await ensureTable(context);
    const client = getTableClient();

    let filter;
    if (view === 'weekly') {
      if (!Number.isFinite(week) || !Number.isFinite(season)) {
        context.res = { status: 400, headers, body: JSON.stringify({ error: 'week and season are required for weekly view' }) };
        return;
      }
      filter = `PartitionKey eq 's${season}w${week}'`;
    } else if (view === 'quarterly') {
      if (!Number.isFinite(season)) {
        context.res = { status: 400, headers, body: JSON.stringify({ error: 'season is required for quarterly view' }) };
        return;
      }
      filter = `season eq ${season}`;
    } else if (view === 'alltime') {
      filter = null;
    } else {
      context.res = { status: 400, headers, body: JSON.stringify({ error: 'view must be weekly, quarterly, or alltime' }) };
      return;
    }

    const entities = [];
    const iter = filter
      ? client.listEntities({ queryOptions: { filter } })
      : client.listEntities();
    for await (const e of iter) entities.push(e);

    let rows;

    if (view === 'weekly') {
      // Best score per user for this single week.
      const bestByUser = new Map();
      for (const e of entities) {
        const prev = bestByUser.get(e.user);
        if (!prev || e.total > prev.total) {
          bestByUser.set(e.user, {
            user:  e.user,
            dept:  e.dept,
            total: e.total,
            grade: e.grade,
          });
        }
      }
      rows = [...bestByUser.values()].sort((a, b) => b.total - a.total);

    } else {
      // Quarterly / all-time: take each user's best score per (season, week),
      // then sum those bests per user.
      const bestPerUserWeek = new Map();
      for (const e of entities) {
        const key = `${e.user}|${e.season}|${e.week}`;
        const prev = bestPerUserWeek.get(key);
        if (!prev || e.total > prev.total) bestPerUserWeek.set(key, e);
      }

      const agg = new Map();
      for (const e of bestPerUserWeek.values()) {
        const a = agg.get(e.user) || { user: e.user, dept: e.dept, total: 0, weeks: 0 };
        a.total += e.total;
        a.weeks += 1;
        a.dept = e.dept; // last-write-wins; good enough for this scale
        agg.set(e.user, a);
      }

      rows = [...agg.values()]
        .map(a => ({
          user:         a.user,
          dept:         a.dept,
          total:        a.total,
          grade:        gradeFromAvg(a.total / a.weeks),
          weeks_played: a.weeks,
        }))
        .sort((a, b) => b.total - a.total);
    }

    context.res = { status: 200, headers, body: JSON.stringify({ rows }) };
  } catch (err) {
    context.log.error('leaderboard fetch failed:', err.message);
    context.res = {
      status: 500, headers,
      body: JSON.stringify({ error: 'Failed to fetch leaderboard', detail: err.message })
    };
  }
};
