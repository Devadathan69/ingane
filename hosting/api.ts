// Built as api/index.mjs for Vercel's Node.js Web Request handler.
import { Hono } from 'hono';
import { createApp } from '../server/app';
import { loadConfig } from '../server/config';
import { familyRoutes } from '../server/family/routes';
import { Pool } from 'pg';
import { PgFamilyStore } from '../server/family/postgres';
import { CreatorAuth } from '../server/family/passkeys';

const config = loadConfig({ ...process.env, INGANE_PROVIDER: 'live' });
const app = new Hono();
const databaseUrl = process.env.INGANE_FAMILY_DATABASE_URL;
const store = databaseUrl ? new PgFamilyStore(new Pool({ connectionString: databaseUrl, max: 3,
  idleTimeoutMillis: 10_000, connectionTimeoutMillis: 10_000, allowExitOnIdle: true })) : null;
store?.pool.on('error', () => console.warn('[ingane] Private storage connection interrupted'));
app.route('/api/family', familyRoutes({ store, creators: new Map(), speech: config.speech,
  uploads: store ?? undefined, auth: store ? new CreatorAuth(store, 'https://ingane.vercel.app', config.narrationSecret) : undefined }));
app.route('/', createApp({
  config,
  getIp: c => c.req.header('x-vercel-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
}));

export default { fetch: (request: Request) => app.fetch(request) };
