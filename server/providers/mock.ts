import { extraGuideCopy } from '../guide-languages';
import type { GuideLocale } from '../../shared/guide';
import {
  ProviderError,
  type GuideProviders,
  type PlannerInput,
  type PlannerOutput,
  type PlannerStep,
  type RemoteObservation,
  type SpeechProviders,
  type VisionControl,
} from './types';

/**
 * DEMO DATA — deterministic stand-ins for tests and offline demos. Not live inference.
 * Control boxes are measured on the CooLux practice crop (315 × 1365);
 * for any other photo they are placeholders, which is why every mock result is flagged demo=true.
 */
const box = (x: number, y: number, w: number, h: number) => ({ x: x / 315, y: y / 1365, w: w / 315, h: h / 1365 });

export const MOCK_CONTROLS: VisionControl[] = [
  { id: 'power', label: 'red power icon', role: 'power', bbox: box(45, 90, 66, 70), confidence: 'high' },
  { id: 'volume_up', label: '+ (volume)', role: 'volume_up', bbox: box(46, 486, 70, 79), confidence: 'high' },
  { id: 'mute', label: 'MUTE, crossed-out speaker', role: 'mute', bbox: box(131, 486, 52, 63), confidence: 'high' },
  { id: 'home', label: 'Smart Hub, coloured cube', role: 'home', bbox: box(128, 645, 57, 77), confidence: 'high' },
  { id: 'nav_ring', label: 'Down arrow', role: 'nav_ring', bbox: box(137, 880, 42, 66), confidence: 'high' },
  { id: 'ok', label: 'Centre Enter, bent arrow', role: 'ok', bbox: box(132, 819, 51, 50), confidence: 'medium' },
  { id: 'back', label: 'RETURN', role: 'back', bbox: box(44, 893, 72, 64), confidence: 'high' },
  { id: 'input', label: 'SOURCE', role: 'input', bbox: box(123, 170, 67, 48), confidence: 'medium' },
];

const T = {
  ...extraGuideCopy,
  ml: {
    mute: ['നിശബ്ദ (crossed-out speaker) ബട്ടൺ ഒരു തവണ അമർത്തുക.', 'ടിവിയിൽ ശബ്ദം തിരികെ വരും; സ്പീക്കർ ചിഹ്നം മാറും.', 'ശബ്ദം ഇപ്പോഴും ഇല്ലെങ്കിൽ, അടുത്ത ഘട്ടത്തിൽ Volume + ഉപയോഗിക്കാം. മറ്റു ബട്ടണുകൾ അമർത്തരുത്.'],
    vol: ['+ (Volume) ബട്ടൺ ഒരു തവണ അമർത്തുക, എന്നിട്ട് ടിവി നോക്കുക.', 'ടിവിയിൽ വോളിയം ബാർ കാണും, ശബ്ദം കൂടും.', 'ഒന്നും കാണുന്നില്ലെങ്കിൽ, റിമോട്ട് ടിവിക്ക് നേരെ പിടിച്ച് വീണ്ടും ഒരു തവണ അമർത്തുക.'],
    home: ['നിറങ്ങളുള്ള Smart Hub ബട്ടൺ ഒരു തവണ അമർത്തുക.', 'ടിവിയിൽ ആപ്പുകളുടെ നിരകളുള്ള ഹോം സ്ക്രീൻ വരും.', 'ഹോം സ്ക്രീൻ വന്നില്ലെങ്കിൽ, റിമോട്ട് ടിവിക്ക് നേരെ പിടിച്ച് ഒരു തവണ കൂടി അമർത്തുക.'],
    nav: (l: string) => [`അമ്പുള്ള ബട്ടൺ ഉപയോഗിച്ച് "${l}" തെളിയുന്നതുവരെ നീക്കുക.`, `"${l}" തെളിഞ്ഞുനിൽക്കുന്നു.`, 'ലിസ്റ്റ് മാഞ്ഞുപോയെങ്കിൽ ഒരു ഘട്ടം പിന്നോട്ട് പോകുക.'],
    ok: (l: string) => [`"${l}" തിരഞ്ഞെടുക്കാൻ നടുവിലെ OK അമർത്തുക.`, `"${l}" ലെ ചിത്രം സ്ക്രീനിൽ വരും.`, '"No signal" എന്ന് കാണിച്ചാൽ, ഉപകരണം ഓൺ ആണോ എന്ന് നോക്കുക.'],
    sound: 'ശബ്ദം തിരികെ കൊണ്ടുവരിക',
    goHome: 'ഹോം സ്ക്രീനിലേക്ക് പോകുക',
    hdmi: 'HDMI-യിലേക്ക് മാറുക',
    hdmiQ: 'ഈ ടിവിയുടെ ഇൻപുട്ട് മെനു ഇതുവരെ സ്ഥിരീകരിച്ചിട്ടില്ല. ഇൻപുട്ട് ലിസ്റ്റ് തുറന്നിട്ടുള്ള ടിവി സ്ക്രീനിന്റെ ഒരു ഫോട്ടോ എടുക്കാമോ?',
    wifi: 'Wi-Fi സജ്ജീകരണം ഇപ്പോൾ ലഭ്യമല്ല.',
    other: 'ഈ ആവശ്യം ഇപ്പോൾ പിന്തുണയ്ക്കുന്നില്ല. ശബ്ദം, ഹോം, HDMI എന്നിവ ചോദിക്കാം.',
  },
  en: {
    mute: ['Press the Mute button (crossed-out speaker) once.', 'Sound comes back and the muted speaker icon disappears.', 'If there is still no sound, the next step uses Volume +. Do not press other buttons.'],
    vol: ['Press the + (Volume) button once, then look at the TV.', 'A volume bar appears on the TV and the sound gets louder.', 'If nothing appears, point the remote straight at the TV and press once more.'],
    home: ['Press the Smart Hub button (coloured cube) once.', 'The TV home screen with rows of apps appears.', 'If the home screen did not appear, point the remote at the TV and press once more.'],
    nav: (l: string) => [`Use the direction buttons to move until "${l}" is highlighted.`, `"${l}" is highlighted.`, 'If the list disappeared, go Back one step.'],
    ok: (l: string) => [`Press the centre OK to choose "${l}".`, `The picture from "${l}" fills the screen.`, 'If the TV says "No signal", check that the device is switched on.'],
    sound: 'Restore sound',
    goHome: 'Go to the home screen',
    hdmi: 'Switch to HDMI',
    hdmiQ: 'This TV’s input menu is not confirmed yet. Can you take a photo of the TV screen with the input list open?',
    wifi: 'Wi-Fi setup is not available yet.',
    other: 'That request is not supported yet. You can ask about sound, Home or HDMI.',
  },
};

function step(id: string, controlId: string | null, screenLabel: string | null, [instruction, expectedState, mismatchRecovery]: string[]): PlannerStep {
  return { id, controlId, screenLabel, instruction, narration: instruction, expectedState, mismatchRecovery };
}

export function mockTaskType(request: string) {
  const r = request.toLowerCase();
  if (/wi-?fi|വൈഫൈ|password/.test(r)) return 'wifi' as const;
  if (/hdmi|input|source|ഇൻപുട്ട്/.test(r)) return 'switch_hdmi' as const;
  if (/home|ഹോം|veed|വീട്|होम|முகப்பு|ಮುಖಪುಟ|హోమ్/.test(r)) return 'go_home' as const;
  if (/sound|volume|mute|sabd|shabd|ശബ്ദ|ഒച്ച|ocha|आवाज़|आवाज|ஒலி|சத்தம்|ಧ್ವನಿ|ಶಬ್ದ|ధ్వని|శబ్దం/.test(r)) return 'restore_sound' as const;
  return 'other' as const;
}

function mockPlan(input: PlannerInput): PlannerOutput {
  const t = T[input.locale];
  const type = mockTaskType(input.request);
  const byRole = (role: string) => input.controls.find((c) => c.role === role)?.id;
  const base = { taskType: type, clarification: null, unsupportedReason: null, evidenceRefIds: [] as string[], steps: [] as PlannerStep[] };
  if (type === 'restore_sound') {
    const mute = byRole('mute');
    const vol = byRole('volume_up');
    const steps = [mute && step('s1', mute, null, t.mute), vol && step('s2', vol, null, t.vol)].filter(Boolean) as PlannerStep[];
    return { ...base, taskSummary: t.sound, decision: 'ready', evidenceRefIds: ['generic-sound'], steps };
  }
  if (type === 'go_home') return { ...base, taskSummary: t.goHome, decision: 'ready', evidenceRefIds: ['generic-home'], steps: [step('s1', byRole('home') ?? 'home', null, t.home)] };
  if (type === 'switch_hdmi') {
    // The orchestrator owns the menu opener and selection checkpoints.
    return { ...base, taskSummary: t.hdmi, decision: 'needs_clarification' };
  }
  return { ...base, taskSummary: type, decision: 'unsupported', unsupportedReason: type === 'wifi' ? t.wifi : t.other };
}

export type MockFailure = 'timeout' | 'refusal' | 'malformed' | 'unavailable' | 'blurry' | 'not_remote' | 'bad_bbox' | 'hallucinated_control';

/** failure: optional injected failure, used by tests to exercise error paths through real server code. */
export function createMockGuideProviders(failure?: () => MockFailure | undefined): GuideProviders {
  const maybeFail = () => {
    const f = failure?.();
    if (f === 'timeout' || f === 'refusal' || f === 'malformed' || f === 'unavailable') throw new ProviderError(f, `mock ${f}`);
    return f;
  };
  return {
    name: 'mock',
    async analyzeRemote(): Promise<RemoteObservation> {
      const f = maybeFail();
      if (f === 'not_remote') return { isRemote: false, photoQuality: 'good', controls: [], deviceCandidates: [] };
      const controls = MOCK_CONTROLS.map((c) => ({ ...c, bbox: { ...c.bbox } }));
      if (f === 'bad_bbox') controls[2].bbox = { x: 0.9, y: 0.3, w: 0.3, h: 0.05 };
      return {
        isRemote: true,
        photoQuality: f === 'blurry' ? 'blurry' : 'good',
        controls,
        deviceCandidates: [{ family: 'CooLux practice remote', confidence: 'medium', basis: 'demo data' }],
      };
    },
    async analyzeScreen() {
      maybeFail();
      return { isTvScreen: true, isInputList: true, selectedLabel: null, labels: ['TV', 'HDMI 1', 'HDMI 2', 'AV'], summary: 'demo input list' };
    },
    async plan(input) {
      const f = maybeFail();
      const out = mockPlan(input);
      if (f === 'hallucinated_control' && !input.repairErrors) out.steps = out.steps.map((s) => ({ ...s, controlId: 'netflix_secret' }));
      return out;
    },
  };
}

/** Minimal valid WAV (100 ms of silence) so playback paths can be exercised without a provider. */
export function silentWav(ms = 100): Buffer {
  const rate = 8000;
  const n = Math.round((rate * ms) / 1000);
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  return b;
}

export function createMockSpeechProviders(failure?: () => MockFailure | undefined): SpeechProviders {
  return {
    name: 'mock',
    async transcribe(_audio, locale: GuideLocale) {
      const f = failure?.();
      if (f === 'timeout' || f === 'unavailable') throw new ProviderError(f, `mock ${f}`);
      if (locale === 'ml') return 'ടിവിയിൽ ശബ്ദം ഇല്ല, sound തിരികെ വേണം';
      if (locale === 'en') return 'The TV has no sound';
      return extraGuideCopy[locale].home[0];
    },
    async synthesize() {
      const f = failure?.();
      if (f === 'timeout' || f === 'unavailable') throw new ProviderError(f, `mock ${f}`);
      return silentWav();
    },
  };
}
