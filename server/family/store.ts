import { createHash, randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { FamilySnapshot } from '../../shared/family';

export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const SHARE_LIFETIME = 7 * 24 * 60 * 60 * 1000;
export class FamilyConflict extends Error {}
export class FamilyNotFound extends Error {}

export class FamilyStore {
  constructor(private db: DatabaseSync, private now: () => number = Date.now) {
    db.exec(`PRAGMA foreign_keys=ON; PRAGMA secure_delete=ON; PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS family_links (
        id TEXT PRIMARY KEY, owner TEXT NOT NULL, revision INTEGER NOT NULL, token_hash TEXT UNIQUE,
        expires INTEGER NOT NULL, title TEXT NOT NULL, snapshot TEXT, photo BLOB
      );
      CREATE TABLE IF NOT EXISTS family_clips (
        family_id TEXT NOT NULL REFERENCES family_links(id), step TEXT NOT NULL, wav BLOB NOT NULL,
        PRIMARY KEY (family_id,step)
      )`);
  }
  private mutate<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = work(); this.db.exec('COMMIT'); return result; }
    catch (err) { this.db.exec('ROLLBACK'); throw err; }
  }
  private checkOwner(id: string, owner: string, revision: number) {
    const row = this.db.prepare('SELECT owner,revision FROM family_links WHERE id=?').get(id);
    if (row && row.owner !== owner) throw new FamilyNotFound();
    if ((row?.revision ?? 0) !== revision) throw new FamilyConflict();
    return !!row;
  }
  list(owner: string) {
    this.mutate(() => {
      const now = this.now();
      this.db.prepare('DELETE FROM family_clips WHERE family_id IN (SELECT id FROM family_links WHERE token_hash IS NOT NULL AND expires<=?)').run(now);
      this.db.prepare("UPDATE family_links SET token_hash=NULL,snapshot=NULL,photo=NULL,title='' WHERE token_hash IS NOT NULL AND expires<=?").run(now);
    });
    return this.db.prepare('SELECT id,revision,expires,title,token_hash IS NOT NULL AS active FROM family_links WHERE owner=?').all(owner)
      .map(r => ({ id: String(r.id), revision: Number(r.revision), expires: Number(r.expires), title: String(r.title), active: !!r.active }));
  }
  publish(owner: string, id: string, revision: number, snapshot: FamilySnapshot, photo: Buffer, clips: Map<string, Buffer>) {
    return this.mutate(() => {
      this.checkOwner(id, owner, revision);
      const token = randomBytes(32).toString('base64url'), expires = this.now() + SHARE_LIFETIME;
      this.db.prepare(`INSERT INTO family_links(id,owner,revision,token_hash,expires,title,snapshot,photo) VALUES(?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,token_hash=excluded.token_hash,expires=excluded.expires,
        title=excluded.title,snapshot=excluded.snapshot,photo=excluded.photo`)
        .run(id, owner, revision + 1, digest(token), expires, snapshot.title, JSON.stringify(snapshot), photo);
      this.db.prepare('DELETE FROM family_clips WHERE family_id=?').run(id);
      const insert = this.db.prepare('INSERT INTO family_clips(family_id,step,wav) VALUES(?,?,?)');
      for (const [step, wav] of clips) insert.run(id, step, wav);
      return { token, revision: revision + 1, expires };
    });
  }
  revoke(owner: string, id: string, revision: number) {
    this.mutate(() => {
      if (!this.checkOwner(id, owner, revision)) throw new FamilyNotFound();
      this.db.prepare("UPDATE family_links SET revision=revision+1,token_hash=NULL,expires=0,title='',snapshot=NULL,photo=NULL WHERE id=?").run(id);
      this.db.prepare('DELETE FROM family_clips WHERE family_id=?').run(id);
    });
  }
  read(token: string, part: 'snapshot' | 'photo' | 'clip', step = ''): string | Uint8Array | undefined {
    if (!/^[\w-]{43}$/.test(token)) return undefined;
    const args = [digest(token), this.now()];
    if (part === 'clip') return this.db.prepare(`SELECT wav FROM family_clips JOIN family_links ON id=family_id
      WHERE token_hash=? AND expires>? AND step=?`).get(...args, step)?.wav as Uint8Array | undefined;
    return this.db.prepare('SELECT ' + part + ' AS data FROM family_links WHERE token_hash=? AND expires>?').get(...args)?.data as string | Uint8Array | undefined;
  }
}
