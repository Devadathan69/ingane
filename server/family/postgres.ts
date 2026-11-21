import { randomBytes } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import type { FamilySnapshot } from '../../shared/family';
import { digest, FamilyConflict, FamilyLimit, FamilyNotFound, IncompleteUpload, SHARE_LIFETIME, type FamilyRepository } from './store';

export async function transaction<T>(pool: Pool, action: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const value = await action(client);
    await client.query('COMMIT');
    return value;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally { client.release(); }
}

export class PgFamilyStore implements FamilyRepository {
  constructor(readonly pool: Pool) {}
  private cleaned = 0;

  // Every read checks the deadline in SQL. Housekeeping also releases storage on subsequent use.
  async cleanup() {
    if (Date.now() - this.cleaned < 60_000) return;
    await transaction(this.pool, async c => {
      await c.query("UPDATE family_link SET token_hash=NULL, batch=NULL WHERE batch IS NOT NULL AND expires <= now()");
      await c.query("DELETE FROM family_batch b WHERE pending_until <= now() OR (pending_until IS NULL AND NOT EXISTS (SELECT 1 FROM family_link l WHERE l.batch=b.id))");
      for (const table of ['family_challenge', 'family_session', 'family_budget']) {
        await c.query('DELETE FROM ' + table + ' WHERE expires <= now()');
      }
    });
    this.cleaned = Date.now();
  }

  async permit(bucket: string, limit: number, seconds: number) {
    const result = await this.pool.query(`INSERT INTO family_budget(bucket,used,expires) VALUES ($1,1,now()+$3*interval '1 second')
      ON CONFLICT(bucket) DO UPDATE SET used=CASE WHEN family_budget.expires<=now() THEN 1 ELSE family_budget.used+1 END,
        expires=CASE WHEN family_budget.expires<=now() THEN excluded.expires ELSE family_budget.expires END
      WHERE family_budget.used<$2 OR family_budget.expires<=now() RETURNING used`, [bucket, limit, seconds]);
    return !!result.rowCount;
  }

  private async previous(c: PoolClient, owner: string, id: string, revision: number) {
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['draft:' + id]);
    const { rows: [row] } = await c.query('SELECT owner,revision,batch FROM family_link WHERE id=$1 FOR UPDATE', [id]);
    if (row && row.owner !== owner) throw new FamilyNotFound();
    if ((row?.revision ?? 0) !== revision) throw new FamilyConflict();
    return row;
  }

  async list(owner: string) {
    await this.cleanup();
    const { rows } = await this.pool.query(`SELECT l.id,l.revision,l.expires,b.snapshot->>'title' AS title,
      (l.batch IS NOT NULL AND l.expires>now()) AS active FROM family_link l
      LEFT JOIN family_batch b ON b.id=l.batch WHERE l.owner=$1 ORDER BY l.expires DESC NULLS LAST`, [owner]);
    return rows.map(r => ({ id: String(r.id), revision: Number(r.revision), expires: r.expires?.getTime() ?? 0,
      title: r.active ? String(r.title) : '', active: Boolean(r.active) }));
  }

  async begin(owner: string, id: string, revision: number, snapshot: FamilySnapshot) {
    await this.cleanup();
    return transaction(this.pool, async c => {
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['owner:' + owner]);
      await this.previous(c, owner, id, revision);
      const { rows: [count] } = await c.query('SELECT count(*)::int AS n FROM family_batch WHERE owner=$1 AND pending_until>now()', [owner]);
      if (count.n >= 5) throw new FamilyLimit();
      const batch = randomBytes(16).toString('hex');
      await c.query(`INSERT INTO family_batch(id,owner,draft,revision,snapshot,pending_until)
        VALUES($1,$2,$3,$4,$5,now()+interval '30 minutes')`, [batch, owner, id, revision, snapshot]);
      return batch;
    });
  }

  async pending(owner: string, batch: string): Promise<FamilySnapshot> {
    const { rows: [row] } = await this.pool.query('SELECT snapshot FROM family_batch WHERE id=$1 AND owner=$2 AND pending_until>now()', [batch, owner]);
    if (!row) throw new FamilyNotFound();
    return row.snapshot;
  }

  async write(owner: string, batch: string, part: string, data: Buffer) {
    await transaction(this.pool, async c => {
      const state = await c.query('SELECT id FROM family_batch WHERE id=$1 AND owner=$2 AND pending_until>now() FOR UPDATE', [batch, owner]);
      if (!state.rowCount) throw new FamilyNotFound();
      await c.query('INSERT INTO family_asset(batch,part,body) VALUES($1,$2,$3) ON CONFLICT(batch,part) DO UPDATE SET body=excluded.body', [batch, part, data]);
    });
  }

  async discard(owner: string, batch: string) {
    await this.pool.query('DELETE FROM family_batch WHERE owner=$1 AND id=$2 AND pending_until IS NOT NULL', [owner,batch]);
  }

  async finish(owner: string, batch: string) {
    return transaction(this.pool, async c => {
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['owner:' + owner]);
      const { rows: [upload] } = await c.query('SELECT draft,revision,snapshot FROM family_batch WHERE id=$1 AND owner=$2 AND pending_until>now() FOR UPDATE', [batch, owner]);
      if (!upload) throw new FamilyNotFound();
      const old = await this.previous(c, owner, upload.draft, upload.revision);
      const snapshot: FamilySnapshot = upload.snapshot;
      const required = new Set(['photo', ...snapshot.steps.filter(s => s.hasAudio).map(s => 'clip-' + s.id)]);
      const parts = await c.query('SELECT part FROM family_asset WHERE batch=$1', [batch]);
      if (parts.rows.length !== required.size || parts.rows.some(r => !required.has(r.part))) throw new IncompleteUpload();
      if (!old?.batch) {
        const { rows: [count] } = await c.query('SELECT count(*)::int AS n FROM family_link WHERE owner=$1 AND batch IS NOT NULL AND expires>now()', [owner]);
        if (count.n >= 20) throw new FamilyLimit();
      }
      const token = randomBytes(32).toString('base64url'), expires = Date.now() + SHARE_LIFETIME;
      const revision = upload.revision + 1;
      await c.query(`INSERT INTO family_link(id,owner,revision,token_hash,expires,batch) VALUES($1,$2,$3,$4,$5,$6)
        ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,token_hash=excluded.token_hash,expires=excluded.expires,batch=excluded.batch`,
        [upload.draft, owner, revision, digest(token), new Date(expires), batch]);
      await c.query('UPDATE family_batch SET pending_until=NULL WHERE id=$1', [batch]);
      if (old?.batch) await c.query('DELETE FROM family_batch WHERE id=$1', [old.batch]);
      return { token, revision, expires };
    });
  }

  async publish(owner: string, id: string, revision: number, snapshot: FamilySnapshot, photo: Buffer, clips: Map<string, Buffer>) {
    const batch = await this.begin(owner, id, revision, snapshot);
    try {
      await this.write(owner, batch, 'photo', photo);
      for (const [step, bytes] of clips) await this.write(owner, batch, 'clip-' + step, bytes);
      return await this.finish(owner, batch);
    } catch (err) { await this.discard(owner, batch); throw err; }
  }

  async revoke(owner: string, id: string, revision: number) {
    await transaction(this.pool, async c => {
      const row = await this.previous(c, owner, id, revision);
      if (!row) throw new FamilyNotFound();
      await c.query('UPDATE family_link SET revision=revision+1,token_hash=NULL,expires=NULL,batch=NULL WHERE id=$1', [id]);
      if (row.batch) await c.query('DELETE FROM family_batch WHERE id=$1', [row.batch]);
    });
  }

  async read(token: string, part: 'snapshot' | 'photo' | 'clip', step = '') {
    if (!/^[\w-]{43}$/.test(token)) return;
    const hash = digest(token);
    if (part === 'snapshot') {
      const { rows: [row] } = await this.pool.query(`SELECT b.snapshot FROM family_link l JOIN family_batch b ON l.batch=b.id
        WHERE l.token_hash=$1 AND l.expires>now()`, [hash]);
      return row ? JSON.stringify(row.snapshot) : undefined;
    }
    const { rows: [row] } = await this.pool.query(`SELECT a.body FROM family_link l JOIN family_asset a ON l.batch=a.batch
      WHERE l.token_hash=$1 AND l.expires>now() AND a.part=$2`, [hash, part === 'photo' ? 'photo' : 'clip-' + step]);
    return row?.body as Buffer | undefined;
  }
}
