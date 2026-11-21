// Generates one short clip per Bulbul model/speaker/language so a listener can pick verified voices.
// Usage: npx tsx --env-file-if-exists=.env scripts/verify-voices.ts
// Output: tmp/voices/<lang>-<model>-<speaker>.wav and a PASS/FAIL line per combination.
// A combination "works" only when the API accepts it; whether it sounds right must be judged by a
// Malayalam speaker. Record the chosen config in .env (SARVAM_TTS_MODEL_ML / SARVAM_TTS_SPEAKER_ML).
import { mkdirSync, writeFileSync } from 'node:fs';
import { SarvamAIClient, type SarvamAI } from 'sarvamai';

const key = process.env.SARVAM_API_KEY;
if (!key) {
  console.error('SARVAM_API_KEY is not set. Put it in .env (never commit it).');
  process.exit(2);
}

const client = new SarvamAIClient({ apiSubscriptionKey: key, timeoutInSeconds: 30, maxRetries: 0 });
const SAMPLES = {
  'ml-IN': 'നിശബ്ദ ബട്ടൺ ഒരു തവണ അമർത്തുക. ടിവിയിൽ HDMI 1 തിരഞ്ഞെടുക്കുക.',
  'en-IN': 'Press the Mute button once. Then choose HDMI 1 on the TV.',
} as const;

const COMBOS: { model: SarvamAI.TextToSpeechModel; speaker?: SarvamAI.TextToSpeechSpeaker }[] = [
  { model: 'bulbul:v3', speaker: 'shubh' },
  { model: 'bulbul:v3', speaker: 'kavya' },
  { model: 'bulbul:v3', speaker: 'kavitha' },
  { model: 'bulbul:v3', speaker: 'anand' },
  { model: 'bulbul:v4-flash' },
  { model: 'bulbul:v4-flash', speaker: 'simran_en_narration' },
];

mkdirSync('tmp/voices', { recursive: true });
for (const [lang, text] of Object.entries(SAMPLES) as [keyof typeof SAMPLES, string][]) {
  for (const c of COMBOS) {
    const name = `${lang}-${c.model.replace(':', '_')}-${c.speaker ?? 'default'}`;
    try {
      const res = await client.textToSpeech.convert({ text, language_code: lang, model: c.model, speaker: c.speaker, output_audio_codec: 'wav' });
      const b64 = res.audios?.[0];
      if (!b64) throw new Error('no audio returned');
      writeFileSync(`tmp/voices/${name}.wav`, Buffer.from(b64, 'base64'));
      console.log(`PASS  ${name}`);
    } catch (err) {
      const e = err as { statusCode?: number };
      console.log(`FAIL  ${name}  (HTTP ${e.statusCode ?? 'unavailable'})`);
    }
  }
}
