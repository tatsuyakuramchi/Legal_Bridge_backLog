import "dotenv/config";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";

type MigrationFile = {
  version: string;
  description: string;
  fileName: string;
  fullPath: string;
};

const rootDir = process.cwd();
const migrationsDir = path.join(rootDir, "db", "migrations");
const targetSchema = process.env.PRISMA_SCHEMA || "lb_core";

function resolvePool(): Pool {
  if (process.env.RDS_HOST && process.env.RDS_DB && process.env.RDS_USER) {
    return new Pool({
      host: process.env.RDS_HOST,
      port: Number(process.env.RDS_PORT ?? 5432),
      database: process.env.RDS_DB,
      user: process.env.RDS_USER,
      password: process.env.RDS_PASSWORD,
      ssl: resolveSsl()
    });
  }

  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: resolveSsl()
  });
}

function resolveSsl(): false | { rejectUnauthorized: boolean } {
  const raw = String(process.env.RDS_SSL ?? "true").toLowerCase();
  if (raw === "false" || raw === "0" || raw === "off") {
    return false;
  }
  return { rejectUnauthorized: false };
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, "\"\"")}"`;
}

async function listMigrationFiles(): Promise<MigrationFile[]> {
  const entries = await readdir(migrationsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /^\d+_.+\.sql$/i.test(entry.name))
    .map((entry) => {
      const match = entry.name.match(/^(\d+)_([^.]+)\.sql$/i);
      if (!match) {
        throw new Error(`Unexpected migration file name: ${entry.name}`);
      }
      return {
        version: match[1],
        description: match[2].replace(/_/g, " "),
        fileName: entry.name,
        fullPath: path.join(migrationsDir, entry.name)
      };
    })
    .sort((a, b) => a.version.localeCompare(b.version));
}

async function ensureSchema(pool: Pool): Promise<void> {
  const schema = quoteIdentifier(targetSchema);
  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schema}.schema_migrations (
      version VARCHAR(20) PRIMARY KEY,
      description VARCHAR(200),
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function appliedVersions(pool: Pool): Promise<Set<string>> {
  const schema = quoteIdentifier(targetSchema);
  const result = await pool.query<{ version: string }>(
    `SELECT version FROM ${schema}.schema_migrations ORDER BY version`
  );
  return new Set(result.rows.map((row) => row.version));
}

async function applyMigration(pool: Pool, migration: MigrationFile): Promise<void> {
  const client = await pool.connect();
  const schema = quoteIdentifier(targetSchema);
  const searchPath = `${schema}, public`;
  try {
    const sql = await readFile(migration.fullPath, "utf8");
    await client.query("BEGIN");
    await client.query(`SET LOCAL search_path TO ${searchPath}`);
    await client.query(sql);
    await client.query(
      `INSERT INTO ${schema}.schema_migrations (version, description) VALUES ($1, $2)`,
      [migration.version, migration.description]
    );
    await client.query("COMMIT");
    console.log(`Applied ${migration.fileName} to schema ${targetSchema}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function showStatus(pool: Pool, migrations: MigrationFile[]): Promise<void> {
  const applied = await appliedVersions(pool);
  console.log(`Target schema: ${targetSchema}`);
  for (const migration of migrations) {
    const mark = applied.has(migration.version) ? "x" : " ";
    console.log(`[${mark}] ${migration.fileName}`);
  }
}

async function main(): Promise<void> {
  const migrations = await listMigrationFiles();
  const pool = resolvePool();
  try {
    await ensureSchema(pool);
    const args = new Set(process.argv.slice(2));
    if (args.has("--status")) {
      await showStatus(pool, migrations);
      return;
    }

    const applied = await appliedVersions(pool);
    for (const migration of migrations) {
      if (applied.has(migration.version)) {
        console.log(`Skipped ${migration.fileName}`);
        continue;
      }
      await applyMigration(pool, migration);
    }
  } finally {
    await pool.end();
  }
}

await main();
