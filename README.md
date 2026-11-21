# Ingane (ഇങ്ങനെ)

A mobile-first Malayalam/English visual guide for TV remotes. Ingane shows **which button to press**
on a matching remote photo and moves on when you confirm the result on the TV.
It guides only; it never controls the TV or phone.

- **V4, My Family Guides** (`?flow=family`). Customize a guide for someone, mark buttons on a remote photo, and preview each step. Private sharing is available on a configured server.
- **V3, Ready-made guides** (`?flow=presets`). Choose an exact TV, confirm the remote, and play an authored guide in Malayalam or English. The first pair is an opt-in practice demo.
- **V1, earlier sample guides:** `?guide=practice-hdmi`, `?guide=practice-unmute`. These are static fixtures and still work on any static host.
- **V2, "Guide me with my remote":** `?flow=remote`. You take or choose a photo, say or type the task, get a
  validated guide drawn on your photo, and can hear each step read aloud. This needs the small Node server in `server/`.

## Setup

```bash
npm install
```

For first-time setup, copy `.env.example` to `.env` if `.env` is missing. Keep an existing `.env` and edit it in place. Git ignores this file.

### Try the live photo guide

1. Create an OpenAI project key with access to the Responses API and to the configured model. The project needs available API credit or billing. [OpenAI project settings](https://help.openai.com/en/articles/9186755-managing-projects-in-the-api-platform)
2. In `.env`, set `INGANE_PROVIDER=live` and paste the key after `OPENAI_API_KEY=`. This enables photos and typed requests in English and Malayalam. Leave `SARVAM_API_KEY` empty for text-only use.
3. Run `npm run check:openai` from this folder. It sends a small built-in checkerboard through the same vision code as the app and checks the answer. This uses API credit. The health endpoint reports configuration only.
4. Start `npm run dev:server` and `npm run dev` in separate terminals. The development server reloads its configuration when you save `.env`. Open [Guide me with my remote](http://127.0.0.1:5173/?flow=remote&lang=en), choose your language and agree to send your photo. Use a clear photo of a remote with a visible HOME button and type “Go to the home screen.” Check where the highlight lands.
5. For spoken requests and read-aloud steps, add a Sarvam subscription key to `SARVAM_API_KEY` and refresh the app. [Sarvam key setup](https://docs.sarvam.ai/api-reference/authentication)

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Vision and planning passes (OpenAI Responses API, official `openai` SDK). Server-side only. |
| `OPENAI_MODEL` | Image-capable model. Default `gpt-5.5`. |
| `SARVAM_API_KEY` | Speech-to-text and narration (official `sarvamai` SDK). Server-side only. |
| `SARVAM_STT_MODEL` | Default `saaras:v4`. |
| `SARVAM_TTS_MODEL_ML` / `SARVAM_TTS_SPEAKER_ML` | Malayalam narration. Default `bulbul:v3` / `shubh`. |
| `SARVAM_TTS_MODEL_EN` / `SARVAM_TTS_SPEAKER_EN` | English narration. Default `bulbul:v3` / `shubh`. |
| `INGANE_PROVIDER` | `live` (default) or `mock`. Mock returns deterministic **demo data**, not live inference. |
| `NARRATION_SECRET` | Optional HMAC secret for signed narration requests. Random per process if unset. |
| `PORT`, `HOST` | Default `8787`, `127.0.0.1`. |
| `REQUEST_TIMEOUT_MS`, `OPENAI_TIMEOUT_MS`, `SARVAM_TIMEOUT_MS` | Default 60s / 45s / 20s. |
| `TRUST_PROXY` | Set to `1` only behind a trusted proxy, so rate limits use `X-Forwarded-For`. |

Secrets never go in `VITE_` variables, the client bundle, logs or git. The build output was checked for key
names and SDK code (none found).

## Run

```bash
# Development: two terminals
npm run dev:server          # API on :8787, watches server code and .env on Node 26
npm run dev                 # Vite on :5173, proxies /api → :8787

# Offline demo with no keys (results are labelled "Demo data — not live inference")
INGANE_PROVIDER=mock npm run dev:server

# Production: one process serves dist/ and /api
npm run build
npm start                   # node build/server/index.js
```

The supplied CooLux photograph is by TaurusEmerald. Ingane cropped and resized it under CC BY-SA 4.0. The app includes its credit on each screen. [Photo credit and license](public/photo-credit.txt)

## Try Family Guides locally

1. Run `npm run dev` and open `http://localhost:5173/?flow=presets&lang=en`. Choose **Try the demo → Ingane Demo → DEMO-TV-01 → My remote matches · DEMO-R01**.
2. Choose **Switch to HDMI**, select **HDMI 2**, and choose **Create a family guide**. Give it the title **Amma, switch to HDMI 2**. Choose Malayalam in the preset picker before copying to start with Malayalam instructions. The editor’s guide language controls playback and audio selection. The top-bar language switch controls the editor labels.
3. Edit the first instruction, expected result and recovery. Keep the literal TV label **HDMI 2**. Optionally record up to 15 seconds for the step. Use **Preview guide** to try the recipient’s buttons. **Save draft** keeps the editable text, photo and recordings in this browser’s IndexedDB. Reload and open **My Family Guides → Edit** to return.
4. To use your own remote, choose **My Family Guides → Start with a remote photo**. Choose a front-on photo, tap a button or use **Place mark at centre**, give it a name, then adjust its box. Reuse marked buttons in other steps. **Text-only checkpoint** needs no mark. A ready photo guide from V2 also offers **Create a family guide** for review before saving.

### Try a private share in a signed-out window

Local drafts and preview work with the static client. To enable links, run the Node server with a persistent private SQLite directory and at least one creator credential. Use a Node release with `node:sqlite` (tested with Node 26). The following PowerShell example starts a loopback server with a temporary creator identity. It copies the creator key to your clipboard for sign-in.

```powershell
$creator = node --input-type=module -e "import {randomBytes,createHash} from 'node:crypto'; const key=randomBytes(32).toString('base64url'); process.stdout.write(JSON.stringify({key,hash:createHash('sha256').update(key).digest('hex')}))" | ConvertFrom-Json
$env:INGANE_FAMILY_CREATORS = @{ local = $creator.hash } | ConvertTo-Json -Compress
$env:INGANE_FAMILY_PRIVATE_DIR = Join-Path $PWD '.ingane-private'
$env:HOST = '127.0.0.1'
$env:PORT = '18874'
Set-Clipboard -Value $creator.key
npm run build
npm start
```

Open `http://127.0.0.1:18874/?flow=presets&lang=en` and make the draft on this origin. Under **Shared links**, paste the key into **Creator sign-in**. Choose **Share link**, review who can see the copy and confirm you have permission for the media. The public practice photo carries its credit and CC BY-SA 4.0 license. **Copy link** opens the guide in a signed-out window when pasted there. **Share via…** opens the system share sheet on supported devices and falls back to copying. A phone needs a reachable HTTPS address for the configured server.

The link gives anyone who receives or is forwarded it access for seven days or until the creator stops sharing. The server stores its hash. It checks the same token for the guide, photo and each recording. A draft edit affects recipients only after **Replace shared copy and revoke old link**. **Stop sharing** blocks future requests, including media. Copies already saved by a recipient can persist. After a reload, sign in again to manage links. Use **Replace** if you need a fresh URL. Deleting a browser draft and stopping its shared link are separate actions available in **My Family Guides**.

Keep the database outside public asset directories, with permissions limited to the account running the server (mode 0700 on POSIX). The ignored `.ingane-private` directory is also denied by the development server. For repeated use, keep the creator key privately and configure its same hash and owner ID across restarts. Creator keys and active link URLs are held in browser memory. Snapshots and media use private, uncached responses. Link preview metadata contains only the app name and a generic description.

Personal recordings and written instructions work without provider keys. To enable optional generated narration, configure a creator identity, `INGANE_PROVIDER=live` and the existing server-side `SARVAM_API_KEY`. Only an explicit generation request sends the chosen step text and language to the adapter. Recipients play the saved clip on tap.

### Family Guides files

| Area | Files in this change |
| --- | --- |
| Editor and reader | `src/family/FamilyGuides.tsx`, `Editor.tsx`, `StepEditor.tsx`, `FamilyPlayer.tsx`, `Viewer.tsx`, `Sharing.tsx`, `Narration.tsx`, `strings.ts`, `family.css` in the same directory |
| Drafts and requests | `src/family/draft.ts`, `src/family/storage.ts`, `src/family/api.ts`, `shared/family.ts`, `shared/media.ts` |
| Private server | `server/family/config.ts`, `routes.ts`, `store.ts`, `media.ts` in the same directory, plus `server/index.ts` and `server/media.ts` |
| Existing entry points and player | `src/App.tsx`, `src/presets/Library.tsx`, `src/guideme/GuideMe.tsx`, `src/guideme/useRecorder.ts`, `src/player/StepPlayer.tsx` |
| Setup and checks | `.env.example`, `.gitignore`, `index.html`, `vite.config.ts`, `package.json`, `README.md`, `server/family/family.test.ts`, `src/family/draft.test.ts`, `scripts/e2e-family.mjs` |

## Try the V3 library locally

Run `npm run dev` and open `http://localhost:5173/?flow=presets&lang=en`. The picker, step text, and photo work with the static client. Recorded family narration plays on tap. Presets offer spoken playback when the existing server reports a live speech provider.

### Rehearse the HDMI 2 walkthrough

Choose **Try the HDMI 2 demo** on the home screen, or open `http://127.0.0.1:5173/?flow=presets&demo=hdmi-2&lang=en`. Use `lang=ml` for Malayalam. This opens the existing practice route for DEMO-TV-01 and DEMO-R01. It uses a licensed photograph of a CooLux remote and an example TV menu.

The picker and walkthrough use the same measured photo. The guide opens with the whole remote in view. Choose **Button detail** for a closer look or **Full remote** to zoom back out.

Watch the fingertip land on **SOURCE**, between **TV** and **HDMI**. Choose **I see the input list**, confirm **Down** highlights **HDMI 1**, then confirm the next **Down** highlights **HDMI 2**. Press the **centre Enter button** and confirm the device picture. **Show press again** repeats the gesture. **My screen looks different** pauses on the current step. Reduced motion shows a static outline. This rehearsal runs without provider keys.

For spoken Malayalam or English, run the server with `INGANE_PROVIDER=live` and a server-side `SARVAM_API_KEY`. Preset playback sends only the registry version, collection, guide, step, port and locale to the existing narration endpoint. The server looks up the exact authored line and uses the existing Sarvam SDK adapter. Photos, microphone access and an OpenAI key are unnecessary for presets.

| Collection | Contents |
| --- | --- |
| Device-verified | Empty until a physical test and photo permission are recorded. An unmatched search offers the V2 photo flow. |
| Practice demo | Choose **Try the demo → Ingane Demo → DEMO-TV-01 → My remote matches · DEMO-R01**. The codes and two-port menu are fictional. The CooLux photo supplies the measured button positions. Choose **Switch to HDMI** and the actual port, or **Restore muted sound** for the separate Mute key. |
| Research draft | India Samsung Q60D **QA55Q60DAULXL** and **BN59-01500G**. The draft has no photo, hotspots, tested firmware, or playable steps. Its research references stay outside the client and narration service. |

Registry version 2 lives in `src/data/presets/`. Remote profiles own the photo, its permitted use, dimensions, hash, and controls. TV profiles identify the exact model, market, OS, menu variant and allowed layouts. Each task belongs to one TV/layout pair and has its own evidence and verification date. A second TV using the same layout needs its own authored task. Bump the registry version when changing a photo, route or narration so an older client cannot request a different spoken step. The picker searches both languages and asks for explicit model and layout confirmation, including when a part number matches several layouts.

### First physical verification

1. On the Indian Q60D, record the **QA55Q60DAULXL** label and the installed software version. Check **BN59-01500G** on the remote label. Keep serial numbers out of the photos.
2. Obtain permission for catalog use of a sharp, straight-on photo of that entire remote face. Show the shortcut row, navigation ring, Select, Home and both rockers. Strip metadata, make the final crop, and measure each button on those pixels.
3. With a powered source connected to each port the guide will offer, record the starting screen, each single press, the visible menu labels and focus after every press. Check that the selected device's picture appears. Author routes for the installed firmware and the tested ports.
4. With a programme playing on the TV speakers and the mute icon visible, test one brief inward press of the VOL rocker. Record whether the icon clears and sound returns. Record a recovery for a different result. Dedicated Mute, rocker press and double-press gestures each require their own layout evidence.
5. Record the test date and evidence for the TV, layout and each successful task. Check the rings on both phone widths, then review the Malayalam and English instructions and spoken checks. Only catalog-authorized images and device-verified records qualify for the regular library.

## Supported actions (V2)

| Task | Grounding required | Notes |
| --- | --- | --- |
| Restore sound (mute / volume +) | Approved generic reference `generic-sound`, plus clearly visible mute or volume symbols | Works without a TV model. |
| Go to the Home screen | Approved generic reference `generic-home`, plus a visible house icon or HOME label | Works without a TV model. |
| Switch HDMI | An **approved** model-specific reference matching the remote/TV, **or** a photo of the TV screen showing the input labels | Device-specific menu references are still drafts. Ingane asks for evidence such as a TV-screen photo. It does not guess. |
| Wi-Fi | Not supported (extension) | Ingane never asks for Wi-Fi passwords. |
| Anything else | Not supported | Returned as `unsupported`. |

## How a guide is made (server)

1. **Photo.** The browser applies EXIF orientation, resizes the long side to at most 1600px, and re-encodes as JPEG, which strips all metadata. That same blob is sent for vision and shown in the player, so boxes and overlay share one coordinate space. The server checks magic bytes, size (≤ 4 MB) and dimensions (200–2048px).
2. **Vision pass.** OpenAI proposes only the *visible* controls, each with a normalized `{x,y,w,h}` box, label, role and confidence, plus possible remote families. It never names a TV model. Boxes that fall outside the image are dropped. Results are cached in memory for 15 minutes, keyed by image hash; raw photos are never kept.
3. **Planner pass.** A separate structured-output call receives the control list (not the photo), the approved references for this device, and any TV-screen labels. The transcript goes in an untrusted `<user_request>` block. Steps may only use observed `controlId`s or exact `screenLabel`s.
4. **Server policy and validation** (`server/guide.ts`, `server/validate.ts`):
   - HDMI must be grounded in an approved model reference or the screen photo.
   - Cited references must be approved and offered for this device.
   - Medium/low-confidence controls, or boxes overlapping another button (not counting the nested d-pad), trigger one `confirm_button` question.
   - Malayalam guides must be in Malayalam script, keeping English TV labels such as "HDMI 1" verbatim.
   - `needs_clarification` and `unsupported` results can never carry steps.
   - One repair retry; after that the server fails closed with a readable error. Refusals, malformed output and timeouts become localized errors (422/502/504).
5. **Output contract** (`shared/guide.ts`): `status = ready | needs_clarification | unsupported`, `task`, `locale`, `deviceCandidates`, `observedControls[{id,label,role,bbox,…}]`, `evidenceRefs`, `steps[{id,controlId|screenLabel,instruction,narration,expectedState,mismatchRecovery}]`, plus signed `narrationTokens` and a `demo` flag.

## Clarifications

There is one question at a time:

| Kind | What the user does |
| --- | --- |
| `clearer_photo` | Retake the photo. |
| `screen_photo` | Take a photo of the TV screen, or type the TV model. |
| `tv_model` | Type the model. |
| `confirm_button` | Confirm the outlined button, tap the right button on the photo (that button becomes a user-marked control), or choose "text only, no box". |
| `text` | Free-text answer. |

## Shared player (V1 through V4)

- The real photo, with one high-contrast outline and a subtle press animation (both off under reduced motion).
- Large text, step count, the expected TV result, and Play/Replay.
- "I see it" is the only way forward. "My screen looks different" stays on the step and offers retry, a TV-screen photo, or Start over. Back and Start over always work.
- The overlay is positioned in percentages on the rendered `<img>`, so it handles scaling and letterboxing.
- Narration is generated on tap, reused for the rest of the session, and stopped on navigation. If audio fails, the text stays fully usable.

## V2 privacy and limits

- **Consent:** required on screen before any photo or voice is sent. The server also rejects requests without `consent=true`.
- **Nothing stored or logged:** no photos, audio or transcripts. Logs contain only method, path, status, time and error code.
- **Upload limits:** photo ≤ 4 MB after normalization (25 MB before); voice ≤ 15 s and ≤ 1.5 MB; request ≤ 500 characters; narration ≤ 600 characters.
- **Rate limits:** per IP, every 10 minutes: 12 guides, 30 transcriptions, 120 narrations.
- **Narration:** `/api/speak` accepts signed V2 step text or an allowed V3 step selector. The server resolves the preset narration and HDMI label from its own registry.
- **No device control:** no screen capture, no remote execution, no generated replacement remote images.

## Adding or approving references

V2 references live in `server/references.ts`. A model-specific reference starts as `status: 'draft'`. Drafts are never shown to the planner. Change it to `approved` only after someone has confirmed the button, starting screen, menu path and outcome on the real TV. V3 research candidates live in `server/preset-drafts.ts`.

## Tests

```bash
npm test                    # V1, V2, preset data, API and picker tests
npm run typecheck
npm run build
# Browser checks (system Chrome via playwright-core):
python -m http.server 4173 --bind 127.0.0.1 --directory dist &  # static host for the offline check
INGANE_PROVIDER=mock INGANE_MOCK_FAILURES=1 node build/server/index.js &
node scripts/e2e-check.mjs http://127.0.0.1:8787/   # V1 flow on the V2 server
node scripts/e2e-v2.mjs http://127.0.0.1:8787/ http://127.0.0.1:4173/
npm run e2e:v3 -- http://127.0.0.1:8787/   # built mock server, local Chrome at 360/430px
npm run e2e:v4                             # after build, temporary private SQLite server and signed-out Chrome
npm run e2e:press -- http://127.0.0.1:5173/ # fingertip contact, phone/desktop layouts and reduced motion
# Live checks (need keys in .env):
npx tsx --env-file-if-exists=.env scripts/verify-voices.ts   # Bulbul clips → tmp/voices
npx tsx --env-file-if-exists=.env scripts/live-check.ts public/devices/coolux-practice.jpg
```

Run `python scripts/prepare-fixtures.py` with Pillow installed to generate browser inputs under `tmp/fixtures/` from the licensed photo.

## Known limits

- The mock provider's boxes are measured on the public CooLux practice photo. On any other photo they're placeholders, which is why mock results are always labelled demo data.
- HDMI is clarification-only until a model reference is approved after a real-TV test.
- Wi-Fi is not supported.
- HEIC photos only work where the browser can decode them (Safari). Elsewhere the user gets a clear message.
- The blur threshold (Laplacian variance 60) was calibrated on one sharp/blurred pair (2036 vs 21). It warns but never blocks.
- Malayalam UI copy and narration need review by a native speaker.
