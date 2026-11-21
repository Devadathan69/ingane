import { extraGuideCopy } from './guide-languages';
import type { UiLocale } from '../shared/languages';
import type { GuideLocale } from '../shared/guide';

const en = {
  clearerPhoto: 'The photo is not clear enough to find the buttons. Please retake it in good light, with the whole remote filling the frame.',
  notRemote: 'I could not find a TV remote in this photo. Please take a photo of the remote, front side up.',
  hdmiNeedsEvidence:
    'The input menu for this TV is not confirmed yet, so I will not guess it. If the input list is open on your TV, take a photo of the TV screen and I can guide you from there. Or tell me the TV model.',
  confirmButton: (label: string) => `Is the outlined button the “${label}” button? If not, tap the right button on the photo.`,
  missingControl: (what: string) => `I could not clearly see the ${what} button in this photo. Please retake the photo so the whole remote is visible.`,
  wifi: 'Wi-Fi setup is not available yet, because the menu path has not been confirmed. Ingane will never ask for your Wi-Fi password.',
  other: 'That is not supported yet. You can ask to bring the sound back, go to the Home screen, or switch to HDMI.',
  sound: 'sound',
  home: 'Home',
};

type Messages = typeof en;

const ml: Messages = {
  clearerPhoto: 'ബട്ടണുകൾ കണ്ടെത്താൻ ഫോട്ടോ വ്യക്തമല്ല. നല്ല വെളിച്ചത്തിൽ, റിമോട്ട് മുഴുവൻ ഫ്രെയിമിൽ വരുന്ന രീതിയിൽ വീണ്ടും എടുക്കുക.',
  notRemote: 'ഈ ഫോട്ടോയിൽ ടിവി റിമോട്ട് കണ്ടെത്താനായില്ല. റിമോട്ടിന്റെ മുൻവശത്തിന്റെ ഫോട്ടോ എടുക്കുക.',
  hdmiNeedsEvidence:
    'ഈ ടിവിയുടെ ഇൻപുട്ട് മെനു ഇതുവരെ സ്ഥിരീകരിച്ചിട്ടില്ല, അതുകൊണ്ട് ഊഹിച്ചു പറയില്ല. ടിവിയിൽ ഇൻപുട്ട് ലിസ്റ്റ് തുറന്നിട്ടുണ്ടെങ്കിൽ, ടിവി സ്ക്രീനിന്റെ ഒരു ഫോട്ടോ എടുക്കുക. അല്ലെങ്കിൽ ടിവിയുടെ മോഡൽ പറയുക.',
  confirmButton: (label) => `അടയാളപ്പെടുത്തിയ ബട്ടൺ “${label}” തന്നെയാണോ? അല്ലെങ്കിൽ, ഫോട്ടോയിൽ ശരിയായ ബട്ടണിൽ തൊടുക.`,
  missingControl: (what) => `ഈ ഫോട്ടോയിൽ ${what} ബട്ടൺ വ്യക്തമായി കാണാനായില്ല. റിമോട്ട് മുഴുവൻ കാണുന്ന രീതിയിൽ വീണ്ടും ഫോട്ടോ എടുക്കുക.`,
  wifi: 'Wi-Fi സജ്ജീകരണം ഇപ്പോൾ ലഭ്യമല്ല, കാരണം അതിന്റെ മെനു വഴി സ്ഥിരീകരിച്ചിട്ടില്ല. ഇങ്ങനെ ഒരിക്കലും നിങ്ങളുടെ Wi-Fi പാസ്‌വേഡ് ചോദിക്കില്ല.',
  other: 'ഇത് ഇപ്പോൾ പിന്തുണയ്ക്കുന്നില്ല. ശബ്ദം തിരികെ കൊണ്ടുവരാനോ, ഹോം സ്ക്രീനിലേക്ക് പോകാനോ, HDMI-യിലേക്ക് മാറാനോ ചോദിക്കാം.',
  sound: 'ശബ്ദത്തിന്റെ',
  home: 'Home',
};

function guideMessages(l: keyof typeof extraGuideCopy) {
  const c = extraGuideCopy[l];
  return { clearerPhoto: c.clearerPhoto, notRemote: c.notRemote, hdmiNeedsEvidence: c.hdmiQ,
    confirmButton: (label: string) => c.confirm + ' «' + label + '»?', wifi: c.wifi, other: c.other };
}
export const MESSAGES = { en, ml, hi: guideMessages('hi'), ta: guideMessages('ta'), kn: guideMessages('kn'), te: guideMessages('te') } satisfies Record<GuideLocale, Pick<Messages, 'clearerPhoto' | 'notRemote' | 'hdmiNeedsEvidence' | 'confirmButton' | 'wifi' | 'other'>>;

/** User-facing API error copy (client shows these verbatim). */
export const API_ERRORS: Record<string, Record<UiLocale, string>> = {
  consent_required: { en: 'Please agree to send the photo and request before continuing.', ml: 'തുടരുന്നതിന് മുമ്പ് ഫോട്ടോയും ആവശ്യവും അയയ്ക്കാൻ സമ്മതം നൽകുക.' },
  image_missing: { en: 'Please add a photo of your remote.', ml: 'റിമോട്ടിന്റെ ഒരു ഫോട്ടോ ചേർക്കുക.' },
  image_type: { en: 'That file is not a JPEG, PNG or WebP photo. Take the photo again with the camera button.', ml: 'ഈ ഫയൽ JPEG, PNG, WebP ഫോട്ടോ അല്ല. ക്യാമറ ബട്ടൺ ഉപയോഗിച്ച് വീണ്ടും എടുക്കുക.' },
  image_size: { en: 'The photo is too large. Please retake it.', ml: 'ഫോട്ടോ വളരെ വലുതാണ്. വീണ്ടും എടുക്കുക.' },
  image_unreadable: { en: 'The photo could not be read. Please retake it.', ml: 'ഫോട്ടോ വായിക്കാനായില്ല. വീണ്ടും എടുക്കുക.' },
  image_dimensions: { en: 'The photo is too small to see the buttons. Move closer and retake it.', ml: 'ബട്ടണുകൾ കാണാൻ ഫോട്ടോ വളരെ ചെറുതാണ്. അടുത്തുനിന്ന് വീണ്ടും എടുക്കുക.' },
  request_missing: { en: 'Please say or type what you want to do.', ml: 'എന്താണ് ചെയ്യേണ്ടതെന്ന് പറയുകയോ ടൈപ്പ് ചെയ്യുകയോ ചെയ്യുക.' },
  request_long: { en: 'Please keep the request short (one sentence).', ml: 'ആവശ്യം ചെറുതായി (ഒരു വാക്യം) പറയുക.' },
  bad_answers: { en: 'Something in the answer was not valid. Please try again.', ml: 'ഉത്തരത്തിൽ എന്തോ ശരിയല്ല. വീണ്ടും ശ്രമിക്കുക.' },
  audio_type: { en: 'That recording format is not supported. Please type your request instead.', ml: 'ഈ റെക്കോർഡിംഗ് ഫോർമാറ്റ് പിന്തുണയ്ക്കുന്നില്ല. ദയവായി ടൈപ്പ് ചെയ്യുക.' },
  audio_size: { en: 'The recording is too long. Keep it under 15 seconds.', ml: 'റെക്കോർഡിംഗ് വളരെ നീളമുള്ളതാണ്. 15 സെക്കൻഡിൽ താഴെ ആക്കുക.' },
  empty_transcript: { en: 'I could not hear any words. Try again closer to the phone, or type instead.', ml: 'വാക്കുകൾ ഒന്നും കേൾക്കാനായില്ല. ഫോണിനടുത്ത് വീണ്ടും പറയുക, അല്ലെങ്കിൽ ടൈപ്പ് ചെയ്യുക.' },
  tts_forbidden: { en: 'Audio is only available for guide steps.', ml: 'ഗൈഡ് ഘട്ടങ്ങൾക്ക് മാത്രമേ ശബ്ദം ലഭ്യമാകൂ.' },
  rate_limited: { en: 'Too many requests. Please wait a minute and try again.', ml: 'വളരെയധികം അഭ്യർത്ഥനകൾ. ഒരു മിനിറ്റ് കാത്തിരുന്ന് വീണ്ടും ശ്രമിക്കുക.' },
  timeout: { en: 'This is taking too long. Please try again.', ml: 'വളരെ സമയം എടുക്കുന്നു. വീണ്ടും ശ്രമിക്കുക.' },
  refusal: { en: 'I can’t help with that request. Try asking about sound, Home or HDMI.', ml: 'ഈ ആവശ്യത്തിൽ സഹായിക്കാനാവില്ല. ശബ്ദം, ഹോം, HDMI എന്നിവയെക്കുറിച്ച് ചോദിക്കാം.' },
  malformed: { en: 'I couldn’t build a reliable guide this time. Please try again or retake the photo.', ml: 'ഇത്തവണ വിശ്വസനീയമായ ഗൈഡ് ഉണ്ടാക്കാനായില്ല. വീണ്ടും ശ്രമിക്കുക, അല്ലെങ്കിൽ ഫോട്ടോ വീണ്ടും എടുക്കുക.' },
  unavailable: { en: 'The guide service is unavailable right now. Please try again shortly.', ml: 'ഗൈഡ് സേവനം ഇപ്പോൾ ലഭ്യമല്ല. അൽപ്പസമയം കഴിഞ്ഞ് ശ്രമിക്കുക.' },
  rejected: { en: 'The service could not process this. Please retake the photo or rephrase.', ml: 'ഇത് പ്രോസസ്സ് ചെയ്യാനായില്ല. ഫോട്ടോ വീണ്ടും എടുക്കുക, അല്ലെങ്കിൽ വേറെ രീതിയിൽ പറയുക.' },
  not_configured: { en: 'Live guides are not set up on this server yet.', ml: 'ഈ സെർവറിൽ ലൈവ് ഗൈഡുകൾ ഇതുവരെ സജ്ജമാക്കിയിട്ടില്ല.' },
  too_large: { en: 'The upload is too large.', ml: 'അപ്‌ലോഡ് വളരെ വലുതാണ്.' },
};
