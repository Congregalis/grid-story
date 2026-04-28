import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

const connectionString =
  process.env.DATABASE_URL || 'postgres://gridstory:gridstory@localhost:5433/gridstory';

const pool = new pg.Pool({ connectionString, max: 10 });

export const db = drizzle({ client: pool });
export { pool };
