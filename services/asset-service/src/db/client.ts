import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { sql } from 'drizzle-orm';

import * as schema from './schema.js';

export type DB = NodePgDatabase<typeof schema>;

let _pool: pg.Pool | undefined;
let _db: DB | undefined;

export function initDb(connectionString: string) {
  _pool = new pg.Pool({ connectionString, max: 10 });
  _db = drizzle(_pool, { schema });
  return { db: _db, pool: _pool };
}

export function db(): DB {
  if (!_db) throw new Error('db not initialized');
  return _db;
}

export function pool(): pg.Pool {
  if (!_pool) throw new Error('pool not initialized');
  return _pool;
}

export async function closeDb() {
  if (_pool) await _pool.end();
  _pool = undefined;
  _db = undefined;
}

export async function withTeamContext<T>(
  teamId: string,
  userId: string,
  fn: (tx: DB) => Promise<T>,
): Promise<T> {
  return db().transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.team_id', ${teamId}, true)`);
    await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);
    return fn(tx);
  });
}
