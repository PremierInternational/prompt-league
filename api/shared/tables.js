/**
 * Shared helper for the Azure Table Storage client.
 *
 * Both the `submissions` (write) and `leaderboard` (read) functions use this
 * so they share one cached client and one "table exists?" check per cold start.
 */

const { TableClient } = require('@azure/data-tables');

const TABLE_NAME = 'submissions';

let cachedClient = null;
let tableEnsured = false;

function getTableClient() {
  if (cachedClient) return cachedClient;

  const conn = process.env.TABLES_CONNECTION_STRING;
  if (!conn) throw new Error('TABLES_CONNECTION_STRING is not configured');

  // allowInsecureConnection lets this work against Azurite (http) locally
  // while still using https against real Azure Storage.
  cachedClient = TableClient.fromConnectionString(conn, TABLE_NAME, {
    allowInsecureConnection: true,
  });
  return cachedClient;
}

async function ensureTable(context) {
  if (tableEnsured) return;
  try {
    await getTableClient().createTable();
  } catch (err) {
    // 409 = TableAlreadyExists — the only expected error.
    if (err?.statusCode !== 409) {
      context?.log?.warn('createTable non-409 error:', err.message);
    }
  }
  tableEnsured = true;
}

module.exports = { getTableClient, ensureTable, TABLE_NAME };
