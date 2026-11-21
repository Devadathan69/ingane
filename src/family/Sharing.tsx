import { useEffect, useState } from 'react';
import type { Locale } from '../data/types';
import type { FamilyDraft } from './draft';
import { capabilities, ownerLinks, publish, stopSharing, type ShareState } from './api';
import { FAMILY } from './strings';

export function useFamilySharing(locale: Locale) {
  const [caps, setCaps] = useState({ sharing: false, sarvam: false });
  const [key, setKey] = useState('');
  const [links, setLinks] = useState<ShareState[]>([]);
  const [urls, setUrls] = useState<Record<string, { url: string; revision: number }>>({});
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const s = FAMILY[locale];
  useEffect(() => { let active = true; capabilities().then(c => { if (active) setCaps(c); }); return () => { active = false; }; }, []);
  const signIn = async (value: string) => {
    setBusy(true); setNotice('');
    try { const rows = await ownerLinks(value); setLinks(rows); setKey(value); }
    catch { setNotice(s.signInFail); } finally { setBusy(false); }
  };
  const signOut = () => { setKey(''); setLinks([]); setUrls({}); setNotice(''); };
  const refresh = async () => {
    setBusy(true);
    try { setLinks(await ownerLinks(key)); } catch { setNotice(s.failedShare); } finally { setBusy(false); }
  };
  const share = async (d: FamilyDraft, permission: boolean) => {
    setBusy(true); setNotice('');
    try {
      const result = await publish(d, links.find(row => row.id === d.id)?.revision ?? 0, permission, key);
      const url = new URL(window.location.href); url.search = '?flow=family-view'; url.hash = result.token;
      setUrls(prev => ({ ...prev, [d.id]: { url: url.href, revision: result.revision } }));
      setLinks(prev => [...prev.filter(row => row.id !== d.id), { id: d.id, active: true, title: d.guide.title, revision: result.revision, expires: result.expires }]);
      setNotice(s.shareReady);
    } catch { setNotice(s.failedShare); await refresh(); } finally { setBusy(false); }
  };
  const revoke = async (row: ShareState) => {
    setBusy(true); setNotice('');
    try {
      await stopSharing(row, key); setUrls(prev => { const next = { ...prev }; delete next[row.id]; return next; });
      setLinks(prev => prev.map(r => r.id === row.id ? { ...r, revision: row.revision + 1, active: false } : r));
      setNotice(s.revoked);
    } catch { setNotice(s.failedShare); await refresh(); } finally { setBusy(false); }
  };
  return { caps, key, links, urls, notice, busy, signIn, signOut, refresh, share, revoke };
}
type Sharing = ReturnType<typeof useFamilySharing>;

function LinkActions({ url, locale }: { url: string; locale: Locale }) {
  const s = FAMILY[locale], [message, setMessage] = useState('');
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setMessage(s.copied); }
    catch { setMessage(s.copyManually); }
  };
  return <div className="stack">
    <label className="field">{s.share}<input type="text" readOnly value={url} onFocus={e => e.target.select()} /></label>
    <button type="button" className="btn btn-secondary" onClick={copy}>{s.copy}</button>
    <button type="button" className="btn btn-secondary" onClick={async () => {
      if (!navigator.share) return copy();
      try { await navigator.share({ title: 'Ingane', url }); }
      catch (err) { if (!(err instanceof DOMException && err.name === 'AbortError')) await copy(); }
    }}>{s.sheet}</button>
    {message && <p role="status">{message}</p>}
  </div>;
}

export function SharePanel({ model, locale, draft, validate }: { model: Sharing; locale: Locale; draft?: FamilyDraft; validate?: () => boolean }) {
  const s = FAMILY[locale];
  const [input, setInput] = useState(''), [confirm, setConfirm] = useState(false), [permission, setPermission] = useState(false);
  const [stopping, setStopping] = useState('');
  const active = model.links.filter(r => r.active && r.expires > Date.now() && (!draft || r.id === draft.id));
  return <section className="family-step share-panel stack" aria-label={s.shares}><h2>{s.shares}</h2>
    {!model.caps.sharing && <><button className="btn btn-secondary" disabled>{s.share}</button><p className="muted">{s.shareOff}</p></>}
    {(model.caps.sharing || model.caps.sarvam) && !model.key && <div className="stack">
      <p className="muted">{s.signInHelp}</p>
      <label className="field">{s.key}<input type="password" value={input} maxLength={100} autoComplete="off" spellCheck={false}
        onChange={e => setInput(e.target.value)} /></label>
      <button className="btn btn-secondary" disabled={!input.trim() || model.busy} onClick={() => { void model.signIn(input.trim()); setInput(''); }}>{s.signIn}</button>
      {model.caps.sharing && <button className="btn btn-secondary" disabled>{s.share}</button>}
    </div>}
    {model.key && <>
      {draft && model.caps.sharing && <>
        <p className="muted">{s.shareSaved}</p>
        <button className="btn btn-secondary" disabled={model.busy} onClick={() => { if (validate?.()) { setConfirm(true); setPermission(false); } }}>
          {active.length ? s.replace : s.share}
        </button>
        {confirm && <div className="recovery"><p>{s.warning}</p>{draft.guide.demo && <p>{s.demoPermission}</p>}<label className="check">
          <input type="checkbox" checked={permission} onChange={e => setPermission(e.target.checked)} />{s.permission}</label>
          <button className="btn btn-primary" disabled={!permission || model.busy} onClick={() => {
            if (validate?.()) { setConfirm(false); void model.share(draft, permission); }
          }}>{active.length ? s.confirmReplace : s.shareNew}</button><button className="btn btn-secondary" onClick={() => setConfirm(false)}>{s.cancel}</button>
        </div>}
      </>}
      {!draft && !active.length && <p className="muted">{s.noShares}</p>}
      {active.map(r => <div key={r.id} className="stack">
        <strong>{r.title}</strong><span>{s.active} {new Date(r.expires).toLocaleDateString(locale)}</span>
        {model.urls[r.id]?.revision === r.revision && <LinkActions url={model.urls[r.id].url} locale={locale} />}
        {stopping === r.id ? <div className="recovery"><p>{s.warning}</p>
          <button className="btn btn-primary" disabled={model.busy} onClick={() => { setStopping(''); void model.revoke(r); }}>{s.revoke}</button>
          <button className="btn btn-secondary" onClick={() => setStopping('')}>{s.cancel}</button></div> :
        <button className="btn btn-secondary" disabled={model.busy} onClick={() => setStopping(r.id)}>{s.revoke}</button>}
      </div>)}
      {!draft && <button className="btn btn-secondary" disabled={model.busy} onClick={model.refresh}>{s.refresh}</button>}
      <button className="btn btn-secondary" disabled={model.busy} onClick={() => { model.signOut(); setConfirm(false); }}>{s.signOut}</button>
    </>}
    {model.notice && <p role="status">{model.notice}</p>}
  </section>;
}
