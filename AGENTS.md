# Ingane (ഇങ്ങനെ)

Mobile-first Malayalam/English visual guide for physical devices. It shows what to press on a photo of
the user's actual remote. It guides only; it never controls the device.

## Commands
- `npm install` — install (deps were resolved with `--before` to avoid brand-new releases)
- `npm run dev` — dev server
- `npm test` — vitest unit + UI tests (jsdom)
- `npm run typecheck` — `tsc -b`
- `npm run build` — typecheck + static build into `dist/` (relative `base: './'`, deployable to any static host)
- `npm run preview -- --port 4173` then `node scripts/e2e-check.mjs` — real-browser checks with the
  locally installed Chrome (360/430px, ring anchoring, touch targets, keyboard, reload, reduced motion,
  unknown id, image failure). Screenshots go to `tmp/shots/` (gitignored). Note: full-page screenshots
  reset the photo's inner scroll; use viewport screenshots to judge what a phone shows.

## Layout
- `src/data/` — content and validation only (no UI). `types.ts`, `devices.ts`, `guides.ts`, `validate.ts`, `index.ts` (`lookupGuide`).
- `src/player/` — `progress.ts` (pure step machine), `Player.tsx`, `RemoteImage.tsx`.
- `src/i18n.ts` — UI strings (ml/en). `src/App.tsx` — `?guide=<id>&lang=<ml|en>` routing.
- `public/devices/` — final cropped, metadata-stripped device photos. See `public/photo-credit.txt` for the supplied practice photo. Keep personal uploads outside the public repository.

## Adding or editing a guide
1. Put the final, oriented, cropped image in `public/devices/` (re-save it so EXIF is stripped).
2. Add a `Device` in `src/data/devices.ts` with its own id, image, real pixel `width`/`height`, and ml/en alt text.
3. Add a `Guide` in `src/data/guides.ts` (`id` is the URL value: `?guide=<id>`). Each step needs `id`, `image`,
   `button`, `instruction`, `expected`, `recovery` in both `ml` and `en`; optional `hotspot` and `audio`.
4. Hotspots are `{x,y,w,h}` normalized (0–1) to the **final** image. Measure them on that device's own photo.
   Never copy coordinates or menu paths between devices.
5. Keep `verification: 'unverified'` until the owner has confirmed the button, starting screen, menu and
   outcome on the real device. Only then set `'verified'` and update `verificationNote`.
6. Run `npm test`. Fixture validation fails the build-time tests on bad coordinates or missing copy, and
   invalid guides show an error page instead of rendering.

## V2 (branch `v2`): "Guide me with my remote"
- Server: `server/` (Hono on Node). `npm run dev:server` (Node watch with tsx, reads `.env`), `npm start` after `npm run build`.
  `INGANE_PROVIDER=mock` = demo data (no keys). Keys: `OPENAI_API_KEY`, `SARVAM_API_KEY` (server only; see `.env.example`).
- Shared contract + zod schema: `shared/guide.ts` (client imports types only).
- Orchestrator/policy: `server/guide.ts`; final gate: `server/validate.ts`; references: `server/references.ts` (drafts are never used).
- Client flow: `src/guideme/` (`GuideMe.tsx`, `photo.ts` normalization/blur, `useRecorder.ts`, `api.ts`). Shared player: `src/player/StepPlayer.tsx`
  (V1 `Player.tsx` is a thin adapter — keep V1 copy/DOM stable; V1 tests depend on it).
- Typecheck: `npm run typecheck` (client tsconfig + `tsconfig.server.json`, which also covers `scripts/*.ts`).
- Server tests start with `// @vitest-environment node`.
- Generate local browser fixtures from the licensed practice photograph with `python scripts/prepare-fixtures.py` (Pillow required). The generated inputs live in `tmp/fixtures/`.
- Shell note: very long heredocs get truncated in this environment; write large files with the file tool.

## V3 ready-made guides

- The versioned registry, layout controls and task routes live in `src/data/presets/`. Research-only profiles live in `server/preset-drafts.ts`. Check photo rights, the exact TV/menu variant and each task on hardware before recording device verification.
- `src/presets/` serves `?flow=presets` with the shared StepPlayer. `server/presets.ts` resolves authored narration for the existing speech endpoint.
- Run `npm run e2e:v3` against the built mock server to check both languages and button alignment at 360/430px.
