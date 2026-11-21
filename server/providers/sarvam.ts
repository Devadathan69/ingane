import { SarvamAIClient, SarvamAIError, SarvamAITimeoutError, type SarvamAI } from 'sarvamai';
import type { GuideLocale } from '../../shared/guide';
import { ProviderError, type SpeechProviders } from './types';

export interface TtsConfig {
  model: SarvamAI.TextToSpeechModel;
  speaker: SarvamAI.TextToSpeechSpeaker;
}

const LANG: Record<GuideLocale, 'ml-IN' | 'en-IN'> = { ml: 'ml-IN', en: 'en-IN' };

/** Terms we want Saaras to keep in Latin script when people say them inside Malayalam. */
const KEYTERMS = ['HDMI', 'HDMI 1', 'HDMI 2', 'Input', 'Source', 'Volume', 'Mute', 'Home', 'Netflix', 'YouTube', 'OK', 'TV', 'remote'];

function toError(err: unknown, what: string): ProviderError {
  if (err instanceof ProviderError) return err;
  if (err instanceof SarvamAITimeoutError || (err instanceof Error && err.name === 'AbortError')) {
    return new ProviderError('timeout', `Sarvam ${what} timed out`);
  }
  if (err instanceof SarvamAIError) {
    const code = err.statusCode ?? 0;
    return new ProviderError(code >= 400 && code < 500 ? 'rejected' : 'unavailable', `Sarvam ${what} error ${code}`);
  }
  return new ProviderError('unavailable', `Sarvam ${what} failed`);
}

export function createSarvamProviders(opts: {
  apiKey: string;
  timeoutMs: number;
  sttModel: SarvamAI.SpeechToTextModel;
  /** Ordered: the first config that the API accepts is used; later entries are verified fallbacks. */
  tts: Record<GuideLocale, TtsConfig[]>;
}): SpeechProviders {
  const client = new SarvamAIClient({
    apiSubscriptionKey: opts.apiKey,
    timeoutInSeconds: Math.ceil(opts.timeoutMs / 1000),
    maxRetries: 1,
  });

  return {
    name: 'live',
    async transcribe(audio, locale, signal) {
      try {
        const res = await client.speechToText.transcribe(
          {
            file: { data: audio.bytes, filename: 'request', contentType: audio.mime },
            model: opts.sttModel,
            language_code: LANG[locale],
            ...(opts.sttModel === 'saaras:v4' ? { keyterms: KEYTERMS } : {}),
          },
          { abortSignal: signal },
        );
        return (res.transcript ?? '').trim();
      } catch (err) {
        throw toError(err, 'speech-to-text');
      }
    },

    async synthesize(text, locale, signal) {
      let last: ProviderError | undefined;
      for (const cfg of opts.tts[locale]) {
        try {
          const res = await client.textToSpeech.convert(
            {
              text,
              language_code: LANG[locale],
              model: cfg.model,
              speaker: cfg.speaker,
              pace: 0.95,
              output_audio_codec: 'wav',
            },
            { abortSignal: signal },
          );
          const b64 = res.audios?.[0];
          if (!b64) throw new ProviderError('malformed', 'Sarvam returned no audio');
          return Buffer.from(b64, 'base64');
        } catch (err) {
          last = toError(err, 'text-to-speech');
          // Only fall back when the config itself was rejected (e.g. unsupported speaker/model pair).
          if (last.code !== 'rejected') throw last;
        }
      }
      throw last ?? new ProviderError('not_configured', 'No TTS config');
    },
  };
}
