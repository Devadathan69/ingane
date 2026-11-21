import { serve } from '@hono/node-server';
import { getConnInfo } from '@hono/node-server/conninfo';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp } from './app';
import { loadConfig } from './config';
import type { MockFailure } from './providers/mock';
import { Hono } from 'hono';
import { familyConfig } from './family/config';
import { familyRoutes } from './family/routes';

let mockFailure: MockFailure | undefined;
const config = loadConfig(process.env, () => mockFailure);

const app = createApp({
  config,
  getIp: (c) => (config.trustProxy ? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() : undefined) ?? getConnInfo(c).remote.address ?? 'unknown',
  setMockFailure: (f) => {
    mockFailure = f as MockFailure | undefined;
  },
});

// V1 static player and V2 client, served from the same origin as the API.
app.use('/assets/*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'public, max-age=31536000, immutable');
});
app.use('/*', serveStatic({ root: process.env.STATIC_ROOT ?? './dist' }));

const root = new Hono();
root.route('/api/family', familyRoutes(await familyConfig(process.env, config.speech)));
root.route('/', app);
serve({ fetch: root.fetch, port: config.port, hostname: process.env.HOST ?? '127.0.0.1' }, (info) => {
  console.log(
    `[ingane] http://${info.address}:${info.port}  guide=${config.guide?.name ?? 'not configured'}  speech=${config.speech?.name ?? 'not configured'}`,
  );
});
