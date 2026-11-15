import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LATEST_SCHEMA_VERSION, runMigrations } from '../lib/local-db/migrations.js';
import { createSqliteTestDb, type SqliteTestDb } from './helpers/sqlite-test-db.js';

describe('local-db migrations (node:sqlite)', () => {
  let db: SqliteTestDb;

  beforeEach(() => {
    db = createSqliteTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it('applies v1 schema from scratch and sets PRAGMA user_version', async () => {
    const appliedVersion = await runMigrations(db);
    expect(appliedVersion).toBe(LATEST_SCHEMA_VERSION);
    expect(appliedVersion).toBe(1);

    const versionRow = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;', []);
    expect(versionRow?.user_version).toBe(1);

    const tables = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name ASC;",
      [],
    );
    expect(tables.map((t) => t.name)).toEqual([
      'checkups',
      'children',
      'indicator_results',
      'meta',
      'reference_curves',
      'sync_queue',
    ]);

    const indexes = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%' ORDER BY name ASC;",
      [],
    );
    expect(indexes.map((i) => i.name)).toEqual([
      'idx_checkups_user_child_measured',
      'idx_sync_queue_user_status_next',
    ]);
  });

  it('is idempotent when executed multiple times', async () => {
    await runMigrations(db);
    await db.runAsync('INSERT INTO meta (key, value) VALUES (?, ?);', ['app_flag', 'ok']);

    const secondRun = await runMigrations(db);
    expect(secondRun).toBe(1);

    const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?;', [
      'app_flag',
    ]);
    expect(row?.value).toBe('ok');
  });

  it('rejects a database whose user_version is newer than supported', async () => {
    await db.execAsync(`PRAGMA user_version = ${LATEST_SCHEMA_VERSION + 1};`);

    await expect(runMigrations(db)).rejects.toThrow(/superior a la soportada/i);
  });

  it('preserves pre-existing v0 data when migrating from v0 to v1', async () => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE legacy_cache (id TEXT PRIMARY KEY, note TEXT NOT NULL);
    `);
    await db.runAsync('INSERT INTO meta (key, value) VALUES (?, ?);', ['seeded', 'v0']);
    await db.runAsync('INSERT INTO legacy_cache (id, note) VALUES (?, ?);', ['1', 'kept']);

    const applied = await runMigrations(db);
    expect(applied).toBe(1);

    const metaRow = await db.getFirstAsync<{ value: string }>(
      'SELECT value FROM meta WHERE key = ?;',
      ['seeded'],
    );
    const legacyRow = await db.getFirstAsync<{ note: string }>(
      'SELECT note FROM legacy_cache WHERE id = ?;',
      ['1'],
    );
    expect(metaRow?.value).toBe('v0');
    expect(legacyRow?.note).toBe('kept');
  });

  it('enforces CHECK constraints on checkups.sync_state and sync_queue.kind/status', async () => {
    await runMigrations(db);

    const invalidSyncState = db.runAsync(
      `INSERT INTO checkups (user_id, id, child_id, measured_at, payload, sync_state, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?);`,
      ['u1', 'c1', 'ch1', '2026-11-10T10:00:00.000Z', '{}', 'INVALID', '2026-11-10T10:00:00.000Z'],
    );
    await expect(invalidSyncState).rejects.toThrow();

    const invalidKind = db.runAsync(
      `INSERT INTO sync_queue (id, user_id, kind, payload, status, attempts, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?);`,
      [
        'q1',
        'u1',
        'unknown-kind',
        '{}',
        'LOCAL',
        '2026-11-10T10:00:00.000Z',
        '2026-11-10T10:00:00.000Z',
      ],
    );
    await expect(invalidKind).rejects.toThrow();

    const invalidStatus = db.runAsync(
      `INSERT INTO sync_queue (id, user_id, kind, payload, status, attempts, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?);`,
      [
        'q2',
        'u1',
        'checkup',
        '{}',
        'UNKNOWN_STATUS',
        '2026-11-10T10:00:00.000Z',
        '2026-11-10T10:00:00.000Z',
      ],
    );
    await expect(invalidStatus).rejects.toThrow();
  });
});
