import { familyIssues, FAMILY_LIMITS } from '../../shared/family';
import type { FamilyDraft } from './draft';

const STORE = 'drafts';
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('ingane-family', 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('storage_blocked'));
  });
}

export async function listDrafts(): Promise<FamilyDraft[]> {
  const db = await open();
  try {
    const all = await new Promise<FamilyDraft[]>((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
    });
    return all.filter(d => !familyIssues(d.guide, !!d.photo, false).length).sort((a, b) => b.updatedAt - a.updatedAt);
  } finally { db.close(); }
}

/** Compare the revision and write blobs and text together in one IndexedDB transaction. */
async function write(draft: FamilyDraft, remove: boolean) {
  const db = await open();
  const next = { ...draft, revision: draft.revision + 1, updatedAt: Date.now() };
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite'), store = tx.objectStore(STORE);
      let conflict = false;
      const previous = store.get(draft.id);
      previous.onsuccess = () => {
        if ((previous.result?.revision ?? 0) !== draft.revision) { conflict = true; tx.abort(); return; }
        if (remove) store.delete(draft.id); else store.put(next);
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(conflict ? new Error('conflict') : tx.error ?? new Error('storage_failed'));
    });
    return next;
  } finally { db.close(); }
}

export function saveDraft(draft: FamilyDraft) {
  if (familyIssues(draft.guide, !!draft.photo, false).length || (draft.photo?.size ?? 0) > FAMILY_LIMITS.imageBytes ||
      Object.values(draft.clips).some(b => b.size > FAMILY_LIMITS.audioBytes)) throw new Error('invalid');
  return write(draft, false);
}
export const deleteDraft = (draft: FamilyDraft) => write(draft, true);
