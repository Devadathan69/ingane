/** Capabilities are independent. Registered speech codes alone do not enable a guide or a UI. */
export const languages = {
  ml: { native: 'മലയാളം', name: 'Malayalam', code: 'ml-IN', ui: true, guide: true, stt: true, tts: true },
  en: { native: 'English', name: 'English', code: 'en-IN', ui: true, guide: true, stt: true, tts: true },
  hi: { native: 'हिन्दी', name: 'Hindi', code: 'hi-IN', ui: false, guide: true, stt: true, tts: true },
  ta: { native: 'தமிழ்', name: 'Tamil', code: 'ta-IN', ui: false, guide: true, stt: true, tts: true },
  kn: { native: 'ಕನ್ನಡ', name: 'Kannada', code: 'kn-IN', ui: false, guide: true, stt: true, tts: true },
  te: { native: 'తెలుగు', name: 'Telugu', code: 'te-IN', ui: false, guide: true, stt: true, tts: true },
  bn: { native: 'বাংলা', name: 'Bengali', code: 'bn-IN', ui: false, guide: false, stt: false, tts: false },
  mr: { native: 'मराठी', name: 'Marathi', code: 'mr-IN', ui: false, guide: false, stt: false, tts: false },
  gu: { native: 'ગુજરાતી', name: 'Gujarati', code: 'gu-IN', ui: false, guide: false, stt: false, tts: false },
  pa: { native: 'ਪੰਜਾਬੀ', name: 'Punjabi', code: 'pa-IN', ui: false, guide: false, stt: false, tts: false },
  od: { native: 'ଓଡ଼ିଆ', name: 'Odia', code: 'od-IN', ui: false, guide: false, stt: false, tts: false },
} as const;

type Language = keyof typeof languages;
type Enabled<C extends 'ui' | 'guide'> = { [L in Language]: (typeof languages)[L][C] extends true ? L : never }[Language];
export type UiLocale = Enabled<'ui'>;
export type GuideLanguage = Enabled<'guide'>;
const ids = Object.keys(languages) as Language[];
export const uiLanguages = ids.filter((id): id is UiLocale => languages[id].ui);
export const guideLanguages = ids.filter((id): id is GuideLanguage => languages[id].guide);
export const isUiLocale = (id: string): id is UiLocale => uiLanguages.some(l => l === id);
