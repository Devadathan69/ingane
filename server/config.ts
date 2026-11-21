import { randomBytes } from 'node:crypto';
import type { SarvamAI } from 'sarvamai';
import { guideLanguages } from '../shared/languages';
import type { GuideLocale } from '../shared/guide';
import { createMockGuideProviders, createMockSpeechProviders, type MockFailure } from './providers/mock';
import { createOpenAIProviders } from './providers/openai';
import { createSarvamProviders, type TtsConfig } from './providers/sarvam';
import type { GuideProviders, SpeechProviders } from './providers/types';

export interface ServerConfig {
  port: number;
  requestTimeoutMs: number;
  narrationSecret: string;
  guide: GuideProviders | null;
  speech: SpeechProviders | null;
  allowMockFailures: boolean;
  trustProxy: boolean;
}

const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);

function ttsChain(env: NodeJS.ProcessEnv, locale: GuideLocale): TtsConfig[] {
  // Fallback is the documented bulbul:v3 default speaker; replace once voices are verified by a listener.
  const fallback: TtsConfig = { model: 'bulbul:v3', speaker: 'shubh' };
  const primary: TtsConfig = {
    model: (env[`SARVAM_TTS_MODEL_${locale.toUpperCase()}`] as SarvamAI.TextToSpeechModel) || fallback.model,
    speaker: (env[`SARVAM_TTS_SPEAKER_${locale.toUpperCase()}`] as SarvamAI.TextToSpeechSpeaker) || fallback.speaker,
  };
  return primary.model === fallback.model && primary.speaker === fallback.speaker ? [primary] : [primary, fallback];
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, mockFailure?: () => MockFailure | undefined): ServerConfig {
  const mode = env.INGANE_PROVIDER === 'mock' ? 'mock' : 'live';
  let guide: GuideProviders | null = null;
  let speech: SpeechProviders | null = null;
  if (mode === 'mock') {
    guide = createMockGuideProviders(mockFailure);
    speech = createMockSpeechProviders(mockFailure);
  } else {
    if (env.OPENAI_API_KEY) {
      const model = env.OPENAI_MODEL || 'gpt-6-luna';
      guide = createOpenAIProviders({
        apiKey: env.OPENAI_API_KEY, model,
        visionModel: env.OPENAI_VISION_MODEL || (model === 'gpt-6-luna' ? 'gpt-5.5' : model),
        timeoutMs: num(env.OPENAI_TIMEOUT_MS, 75_000),
      });
    }
    if (env.SARVAM_API_KEY) {
      const tts = Object.fromEntries(guideLanguages.map(l => [l, ttsChain(env, l)])) as Record<GuideLocale, TtsConfig[]>;
      speech = createSarvamProviders({
        apiKey: env.SARVAM_API_KEY,
        timeoutMs: num(env.SARVAM_TIMEOUT_MS, 20_000),
        sttModel: (env.SARVAM_STT_MODEL as SarvamAI.SpeechToTextModel) || 'saaras:v4',
        tts,
      });
    }
  }
  return {
    port: num(env.PORT, 8787),
    requestTimeoutMs: num(env.REQUEST_TIMEOUT_MS, 105_000),
    narrationSecret: env.NARRATION_SECRET || randomBytes(32).toString('hex'),
    guide,
    speech,
    allowMockFailures: mode === 'mock' && env.INGANE_MOCK_FAILURES === '1',
    trustProxy: env.TRUST_PROXY === '1',
  };
}
