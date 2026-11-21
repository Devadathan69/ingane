import { existsSync, mkdirSync, realpathSync, statSync, chmodSync, lstatSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { SpeechProviders } from '../providers/types';
import { FamilyStore, type FamilyRepository } from './store';
import type { PgFamilyStore } from './postgres';
import type { CreatorAuth } from './passkeys';

export interface FamilyConfig {
  store: FamilyRepository | null;
  creators: Map<string, string>;
  speech: SpeechProviders | null;
  uploads?: PgFamilyStore;
  auth?: CreatorAuth;
}
const inside = (path: string, root: string) => {
  const r = relative(root, path);
  return r === '' || (!r.startsWith('..' + sep) && r !== '..' && !isAbsolute(r));
};
export async function familyConfig(env: NodeJS.ProcessEnv, speech: SpeechProviders | null): Promise<FamilyConfig> {
  const result: FamilyConfig = { store: null, creators: new Map(), speech: speech?.name === 'live' ? speech : null };
  try {
    const entries = Object.entries(JSON.parse(env.INGANE_FAMILY_CREATORS || '{}'));
    for (const [owner, hash] of entries) {
      if (!/^[\w-]{1,80}$/.test(owner) || typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash) || result.creators.has(hash)) throw new Error();
      result.creators.set(hash, owner);
    }
    if (!entries.length || !env.INGANE_FAMILY_PRIVATE_DIR) return result;
    const dir = resolve(env.INGANE_FAMILY_PRIVATE_DIR);
    // Resolve the existing parent before creating anything. Never put private blobs under a static root.
    const parent = realpathSync(resolve(dir, '..'));
    const target = existsSync(dir) ? realpathSync(dir) : resolve(parent, relative(resolve(dir, '..'), dir));
    const publicRoots = ['public', 'dist', env.STATIC_ROOT ?? 'dist'].map(p => existsSync(p) ? realpathSync(p) : resolve(p));
    if (publicRoots.some(root => inside(target, root))) throw new Error();
    if (inside(target, realpathSync('.')) && !target.split(sep).includes('.ingane-private')) throw new Error();
    mkdirSync(target, { recursive: true, mode: 0o700 });
    const directory = statSync(target);
    if (!directory.isDirectory() || (process.platform !== 'win32' && (directory.mode & 0o077) !== 0)) throw new Error();
    const path = join(target, 'ingane-family.sqlite');
    for (const suffix of ['', '-wal', '-shm', '-journal']) {
      if (existsSync(path + suffix) && (!lstatSync(path + suffix).isFile() || statSync(path + suffix).nlink !== 1)) throw new Error();
    }
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(path);
    try { chmodSync(path, 0o600); result.store = new FamilyStore(db); }
    catch (e) { db.close(); throw e; }
  } catch {
    result.store = null; result.creators.clear();
    console.warn('[ingane] Family sharing configuration unavailable');
  }
  return result;
}
