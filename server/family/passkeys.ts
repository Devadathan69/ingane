import { createHmac, randomBytes } from 'node:crypto';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server';
import type { PgFamilyStore } from './postgres';
import { digest } from './store';

const SESSION = '__Host-ingane-creator', CEREMONY = '__Host-ingane-ceremony';
const cookie = { path: '/', secure: true, httpOnly: true, sameSite: 'Strict' as const };
const nonce = () => randomBytes(32).toString('base64url');
const verifiedToken = (c: Context, name: string) => {
  const value = getCookie(c, name);
  return value && /^[\w-]{43}$/.test(value) ? value : '';
};

export class CreatorAuth {
  constructor(private store: PgFamilyStore, readonly origin: string, private ipSecret: string) {}

  async owner(c: Context): Promise<string | undefined> {
    const token = verifiedToken(c, SESSION);
    if (!token) return;
    const { rows: [row] } = await this.store.pool.query('SELECT owner FROM family_session WHERE token_hash=$1 AND expires>now()', [digest(token)]);
    return row?.owner;
  }

  routes() {
    const app = new Hono(), pool = this.store.pool, rpID = new URL(this.origin).hostname;
    const failed = (c: Context) => c.json({ error: 'sign_in' }, 401);
    app.use('*', bodyLimit({ maxSize: 32 * 1024, onError: c => c.json({error:'limit'}, 413) }));
    app.use('*', async (c, next) => {
      if (c.req.header('Origin') !== this.origin) return c.json({ error: 'origin' }, 403);
      await next();
    });
    app.post('/options/:kind', async c => {
      const kind = c.req.param('kind');
      if (kind !== 'register' && kind !== 'login') return failed(c);
      const ip = c.req.header('x-vercel-forwarded-for')?.split(',')[0]?.trim() || 'local';
      const bucket = createHmac('sha256',this.ipSecret).update(ip).digest('hex');
      await this.store.cleanup();
      if (!await this.store.permit('passkeys:' + bucket, 40, 600)) return c.json({ error: 'limit' }, 429);
      const identity = randomBytes(16), owner = identity.toString('hex');
      const options = kind === 'register' ? await generateRegistrationOptions({
        rpName: 'Ingane', rpID, userName: 'Ingane creator ' + owner.slice(0,6), userID: new Uint8Array(identity),
        attestationType: 'none', authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      }) : await generateAuthenticationOptions({ rpID, userVerification: 'required' });
      const handle = nonce();
      await pool.query(`INSERT INTO family_challenge(nonce,kind,owner,challenge,expires)
        VALUES($1,$2,$3,$4,now()+interval '5 minutes')`, [digest(handle), kind, owner, options.challenge]);
      setCookie(c, CEREMONY, handle, { ...cookie, maxAge: 300 });
      return c.json(options);
    });
    app.post('/finish/:kind', async c => {
      const kind = c.req.param('kind'), handle = verifiedToken(c, CEREMONY);
      if (!handle || (kind !== 'register' && kind !== 'login')) return failed(c);
      const { rows: [challenge] } = await pool.query(`DELETE FROM family_challenge
        WHERE nonce=$1 AND kind=$2 AND expires>now() RETURNING owner,challenge`, [digest(handle), kind]);
      deleteCookie(c, CEREMONY, cookie);
      if (!challenge) return failed(c);
      const response = await c.req.json().catch(() => null);
      if (!response || typeof response.id !== 'string' || response.id.length > 2048) return failed(c);
      const expected = { expectedOrigin: this.origin, expectedRPID: rpID, expectedChallenge: challenge.challenge, requireUserVerification: true };
      let owner: string;
      if (kind === 'register') {
        const verified = await verifyRegistrationResponse({ ...expected, response }).catch(() => null);
        if (!verified?.verified || !verified.registrationInfo) return failed(c);
        const { credential } = verified.registrationInfo;
        owner = challenge.owner;
        const saved = await pool.query(`INSERT INTO family_passkey(credential,owner,public_key,counter)
          VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [credential.id, owner, Buffer.from(credential.publicKey), credential.counter]);
        if (!saved.rowCount) return failed(c);
      } else {
        const { rows: [key] } = await pool.query('SELECT owner,public_key,counter FROM family_passkey WHERE credential=$1', [response.id]);
        if (!key || response.response?.userHandle !== Buffer.from(key.owner,'hex').toString('base64url')) return failed(c);
        const verified = await verifyAuthenticationResponse({ ...expected, response, credential: {
          id: response.id, publicKey: new Uint8Array(key.public_key), counter: Number(key.counter),
        } }).catch(() => null);
        if (!verified?.verified) return failed(c);
        const updated = await pool.query('UPDATE family_passkey SET counter=$1 WHERE credential=$2 AND counter=$3',
          [verified.authenticationInfo.newCounter, response.id, key.counter]);
        if (!updated.rowCount) return failed(c);
        owner = key.owner;
      }
      const session = nonce();
      await pool.query("INSERT INTO family_session(token_hash,owner,expires) VALUES($1,$2,now()+interval '14 days')", [digest(session),owner]);
      setCookie(c, SESSION, session, { ...cookie, maxAge: 14 * 86400 });
      return c.json({ ok: true });
    });
    app.post('/logout', async c => {
      const session = verifiedToken(c, SESSION);
      if (session) await pool.query('DELETE FROM family_session WHERE token_hash=$1', [digest(session)]);
      deleteCookie(c, SESSION, cookie);
      return c.json({ ok: true });
    });
    return app;
  }
}
