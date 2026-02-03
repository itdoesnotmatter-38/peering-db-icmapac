const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
});

const ensureSchema = async () => {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS pdb_snapshot_runs (
        snapshot_date DATE PRIMARY KEY,
        started_at TIMESTAMPTZ NOT NULL,
        completed_at TIMESTAMPTZ,
        status TEXT NOT NULL,
        net_count INTEGER,
        org_count INTEGER,
        blob_prefix TEXT
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS pdb_snapshot_network_types (
        snapshot_date DATE NOT NULL,
        info_type TEXT NOT NULL,
        count INTEGER NOT NULL,
        PRIMARY KEY (snapshot_date, info_type)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS pdb_snapshot_origin_countries (
        snapshot_date DATE NOT NULL,
        country TEXT NOT NULL,
        count INTEGER NOT NULL,
        PRIMARY KEY (snapshot_date, country)
      );
    `);
  } finally {
    client.release();
  }
};

const getRun = async (snapshotDate) => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT snapshot_date, status FROM pdb_snapshot_runs WHERE snapshot_date = $1`,
      [snapshotDate]
    );
    return result.rows[0] || null;
  } finally {
    client.release();
  }
};

const upsertRun = async ({ snapshotDate, status, startedAt, completedAt, netCount, orgCount, blobPrefix }) => {
  const client = await pool.connect();
  try {
    await client.query(
      `
      INSERT INTO pdb_snapshot_runs (snapshot_date, started_at, completed_at, status, net_count, org_count, blob_prefix)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (snapshot_date)
      DO UPDATE SET
        started_at = EXCLUDED.started_at,
        completed_at = EXCLUDED.completed_at,
        status = EXCLUDED.status,
        net_count = EXCLUDED.net_count,
        org_count = EXCLUDED.org_count,
        blob_prefix = EXCLUDED.blob_prefix;
      `,
      [snapshotDate, startedAt, completedAt, status, netCount, orgCount, blobPrefix]
    );
  } finally {
    client.release();
  }
};

const clearAggregates = async (snapshotDate) => {
  const client = await pool.connect();
  try {
    await client.query(`DELETE FROM pdb_snapshot_network_types WHERE snapshot_date = $1`, [snapshotDate]);
    await client.query(`DELETE FROM pdb_snapshot_origin_countries WHERE snapshot_date = $1`, [snapshotDate]);
  } finally {
    client.release();
  }
};

const insertTypeCounts = async (snapshotDate, counts) => {
  const client = await pool.connect();
  try {
    for (const [infoType, count] of counts.entries()) {
      await client.query(
        `
        INSERT INTO pdb_snapshot_network_types (snapshot_date, info_type, count)
        VALUES ($1, $2, $3)
        ON CONFLICT (snapshot_date, info_type)
        DO UPDATE SET count = EXCLUDED.count;
        `,
        [snapshotDate, infoType, count]
      );
    }
  } finally {
    client.release();
  }
};

const insertCountryCounts = async (snapshotDate, counts) => {
  const client = await pool.connect();
  try {
    for (const [country, count] of counts.entries()) {
      await client.query(
        `
        INSERT INTO pdb_snapshot_origin_countries (snapshot_date, country, count)
        VALUES ($1, $2, $3)
        ON CONFLICT (snapshot_date, country)
        DO UPDATE SET count = EXCLUDED.count;
        `,
        [snapshotDate, country, count]
      );
    }
  } finally {
    client.release();
  }
};

module.exports = {
  ensureSchema,
  getRun,
  upsertRun,
  clearAggregates,
  insertTypeCounts,
  insertCountryCounts,
};
