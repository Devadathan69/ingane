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
  consent_required: {
    en: 'Please agree to send the photo and request before continuing.',
    ml: 'തുടരുന്നതിന് മുമ്പ് ഫോട്ടോയും ആവശ്യവും അയയ്ക്കാൻ സമ്മതം നൽകുക.',
    hi: 'आगे बढ़ने से पहले फ़ोटो और अनुरोध भेजने की सहमति दें।',
    ta: 'தொடரும் முன் படம் மற்றும் கோரிக்கையை அனுப்ப ஒப்புக்கொள்ளவும்.',
    kn: 'ಮುಂದುವರಿಯುವ ಮೊದಲು ಫೋಟೋ ಮತ್ತು ವಿನಂತಿ ಕಳುಹಿಸಲು ಒಪ್ಪಿಗೆ ನೀಡಿ.',
    te: 'కొనసాగించే ముందు ఫోటో, అభ్యర్థన పంపడానికి అంగీకరించండి.',
  },
  image_missing: {
    en: 'Please add a photo of your remote.',
    ml: 'റിമോട്ടിന്റെ ഒരു ഫോട്ടോ ചേർക്കുക.',
    hi: 'अपने रिमोट की फ़ोटो जोड़ें।',
    ta: 'ரிமோட்டின் படத்தைச் சேர்க்கவும்.',
    kn: 'ನಿಮ್ಮ ರಿಮೋಟ್ ಫೋಟೋ ಸೇರಿಸಿ.',
    te: 'మీ రిమోట్ ఫోటో జోడించండి.',
  },
  image_type: {
    en: 'That file is not a JPEG, PNG or WebP photo. Take the photo again with the camera button.',
    ml: 'ഈ ഫയൽ JPEG, PNG, WebP ഫോട്ടോ അല്ല. ക്യാമറ ബട്ടൺ ഉപയോഗിച്ച് വീണ്ടും എടുക്കുക.',
    hi: 'JPEG, PNG या WebP फ़ोटो चुनें या कैमरे से नई फ़ोटो लें।',
    ta: 'JPEG, PNG அல்லது WebP படத்தைத் தேர்வுசெய்யவும் அல்லது கேமராவில் புதிதாக எடுக்கவும்.',
    kn: 'JPEG, PNG ಅಥವಾ WebP ಫೋಟೋ ಆರಿಸಿ ಅಥವಾ ಕ್ಯಾಮೆರಾದಿಂದ ಹೊಸ ಫೋಟೋ ತೆಗೆಯಿರಿ.',
    te: 'JPEG, PNG లేదా WebP ఫోటో ఎంచుకోండి లేదా కెమెరాతో కొత్త ఫోటో తీయండి.',
  },
  image_size: {
    en: 'The photo is too large. Please retake it.',
    ml: 'ഫോട്ടോ വളരെ വലുതാണ്. വീണ്ടും എടുക്കുക.',
    hi: 'फ़ोटो बहुत बड़ी है। फिर से लें।',
    ta: 'படம் மிகப் பெரியது. மீண்டும் எடுக்கவும்.',
    kn: 'ಫೋಟೋ ತುಂಬಾ ದೊಡ್ಡದು. ಮತ್ತೆ ತೆಗೆಯಿರಿ.',
    te: 'ఫోటో చాలా పెద్దది. మళ్లీ తీయండి.',
  },
  image_unreadable: {
    en: 'The photo could not be read. Please retake it.',
    ml: 'ഫോട്ടോ വായിക്കാനായില്ല. വീണ്ടും എടുക്കുക.',
    hi: 'फ़ोटो नहीं खुली। दोबारा लें।',
    ta: 'படம் திறக்கவில்லை. மீண்டும் எடுக்கவும்.',
    kn: 'ಫೋಟೋ ತೆರೆಯಲಿಲ್ಲ. ಮತ್ತೆ ತೆಗೆಯಿರಿ.',
    te: 'ఫోటో తెరుచుకోలేదు. మళ్లీ తీయండి.',
  },
  image_dimensions: {
    en: 'The photo is too small to see the buttons. Move closer and retake it.',
    ml: 'ബട്ടണുകൾ കാണാൻ ഫോട്ടോ വളരെ ചെറുതാണ്. അടുത്തുനിന്ന് വീണ്ടും എടുക്കുക.',
    hi: 'बटन बहुत छोटे दिख रहे हैं। पास से फ़ोटो लें।',
    ta: 'பட்டன்கள் மிகச் சிறியதாகத் தெரிகின்றன. அருகிலிருந்து படம் எடுக்கவும்.',
    kn: 'ಬಟನ್‌ಗಳು ತುಂಬಾ ಚಿಕ್ಕದಾಗಿ ಕಾಣುತ್ತಿವೆ. ಹತ್ತಿರದಿಂದ ಫೋಟೋ ತೆಗೆಯಿರಿ.',
    te: 'బటన్లు చాలా చిన్నగా కనిపిస్తున్నాయి. దగ్గరగా ఫోటో తీయండి.',
  },
  request_missing: {
    en: 'Please say or type what you want to do.',
    ml: 'എന്താണ് ചെയ്യേണ്ടതെന്ന് പറയുകയോ ടൈപ്പ് ചെയ്യുകയോ ചെയ്യുക.',
    hi: 'बताएँ या लिखें कि क्या करना है।',
    ta: 'என்ன செய்ய வேண்டும் என்று சொல்லவும் அல்லது எழுதவும்.',
    kn: 'ಏನು ಮಾಡಬೇಕು ಎಂದು ಹೇಳಿ ಅಥವಾ ಬರೆಯಿರಿ.',
    te: 'ఏం చేయాలో చెప్పండి లేదా రాయండి.',
  },
  request_long: {
    en: 'Please keep the request short (one sentence).',
    ml: 'ആവശ്യം ചെറുതായി (ഒരു വാക്യം) പറയുക.',
    hi: 'एक छोटे वाक्य में अपना अनुरोध दें।',
    ta: 'ஒரு சிறிய வாக்கியத்தில் கோரிக்கையைத் தரவும்.',
    kn: 'ಒಂದು ಚಿಕ್ಕ ವಾಕ್ಯದಲ್ಲಿ ವಿನಂತಿ ತಿಳಿಸಿ.',
    te: 'మీ అభ్యర్థన ఒక చిన్న వాక్యంలో చెప్పండి.',
  },
  bad_answers: {
    en: 'Something in the answer was not valid. Please try again.',
    ml: 'ഉത്തരത്തിൽ എന്തോ ശരിയല്ല. വീണ്ടും ശ്രമിക്കുക.',
    hi: 'जवाब समझ नहीं आया। फिर कोशिश करें।',
    ta: 'பதிலை ஏற்க முடியவில்லை. மீண்டும் முயலவும்.',
    kn: 'ಉತ್ತರ ಸ್ವೀಕರಿಸಲು ಆಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
    te: 'సమాధానం అర్థం కాలేదు. మళ్లీ ప్రయత్నించండి.',
  },
  audio_type: {
    en: 'That recording format is not supported. Please type your request instead.',
    ml: 'ഈ റെക്കോർഡിംഗ് ഫോർമാറ്റ് പിന്തുണയ്ക്കുന്നില്ല. ദയവായി ടൈപ്പ് ചെയ്യുക.',
    hi: 'यह रिकॉर्डिंग फ़ॉर्मैट नहीं चलेगा। अपना अनुरोध लिखें।',
    ta: 'இந்தப் பதிவு வடிவம் ஆதரிக்கப்படவில்லை. கோரிக்கையை எழுதவும்.',
    kn: 'ಈ ರೆಕಾರ್ಡಿಂಗ್ ಸ್ವರೂಪ ಬೆಂಬಲಿತವಾಗಿಲ್ಲ. ವಿನಂತಿ ಬರೆಯಿರಿ.',
    te: 'ఈ రికార్డింగ్ ఫార్మాట్ వాడలేం. మీ అభ్యర్థన రాయండి.',
  },
  audio_size: {
    en: 'The recording is too long. Keep it under 15 seconds.',
    ml: 'റെക്കോർഡിംഗ് വളരെ നീളമുള്ളതാണ്. 15 സെക്കൻഡിൽ താഴെ ആക്കുക.',
    hi: 'रिकॉर्डिंग 15 सेकंड से छोटी रखें।',
    ta: 'பதிவை 15 வினாடிகளுக்குள் முடிக்கவும்.',
    kn: 'ರೆಕಾರ್ಡಿಂಗ್ 15 ಸೆಕೆಂಡ್ ಒಳಗೆ ಇರಲಿ.',
    te: 'రికార్డింగ్ 15 సెకన్లలోపు ఉంచండి.',
  },
  empty_transcript: {
    en: 'I could not hear any words. Try again closer to the phone, or type instead.',
    ml: 'വാക്കുകൾ ഒന്നും കേൾക്കാനായില്ല. ഫോണിനടുത്ത് വീണ്ടും പറയുക, അല്ലെങ്കിൽ ടൈപ്പ് ചെയ്യുക.',
    hi: 'शब्द सुनाई नहीं दिए। फ़ोन के पास फिर बोलें या लिखें।',
    ta: 'வார்த்தைகள் கேட்கவில்லை. கைப்பேசிக்கு அருகில் மீண்டும் பேசவும் அல்லது எழுதவும்.',
    kn: 'ಮಾತು ಕೇಳಿಸಲಿಲ್ಲ. ಫೋನ್ ಹತ್ತಿರ ಮತ್ತೆ ಹೇಳಿ ಅಥವಾ ಬರೆಯಿರಿ.',
    te: 'మాటలు వినిపించలేదు. ఫోన్ దగ్గర మళ్లీ మాట్లాడండి లేదా రాయండి.',
  },
  tts_forbidden: {
    en: 'Audio is only available for guide steps.',
    ml: 'ഗൈഡ് ഘട്ടങ്ങൾക്ക് മാത്രമേ ശബ്ദം ലഭ്യമാകൂ.',
    hi: 'आवाज़ सिर्फ़ गाइड के चरणों के लिए उपलब्ध है।',
    ta: 'குரல் வழிகாட்டியின் படிகளுக்கு மட்டுமே கிடைக்கும்.',
    kn: 'ಧ್ವನಿ ಮಾರ್ಗದರ್ಶಿಯ ಹಂತಗಳಿಗೆ ಮಾತ್ರ ಲಭ್ಯ.',
    te: 'గైడ్ దశలకు మాత్రమే వాయిస్ అందుబాటులో ఉంది.',
  },
  rate_limited: {
    en: 'Too many requests. Please wait a minute and try again.',
    ml: 'വളരെയധികം അഭ്യർത്ഥനകൾ. ഒരു മിനിറ്റ് കാത്തിരുന്ന് വീണ്ടും ശ്രമിക്കുക.',
    hi: 'बहुत से अनुरोध आए हैं। एक मिनट बाद फिर कोशिश करें।',
    ta: 'கோரிக்கைகள் அதிகம். ஒரு நிமிடம் கழித்து மீண்டும் முயலவும்.',
    kn: 'ಹೆಚ್ಚು ವಿನಂತಿಗಳಿವೆ. ಒಂದು ನಿಮಿಷದ ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
    te: 'చాలా అభ్యర్థనలు వచ్చాయి. ఒక నిమిషం తర్వాత మళ్లీ ప్రయత్నించండి.',
  },
  timeout: {
    en: 'This is taking too long. Please try again.',
    ml: 'വളരെ സമയം എടുക്കുന്നു. വീണ്ടും ശ്രമിക്കുക.',
    hi: 'बहुत समय लग रहा है। फिर कोशिश करें।',
    ta: 'அதிக நேரம் எடுக்கிறது. மீண்டும் முயலவும்.',
    kn: 'ತುಂಬಾ ಸಮಯ ತೆಗೆದುಕೊಳ್ಳುತ್ತಿದೆ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
    te: 'చాలా సమయం పడుతోంది. మళ్లీ ప్రయత్నించండి.',
  },
  refusal: {
    en: 'I can’t help with that request. Try asking about sound, Home or HDMI.',
    ml: 'ഈ ആവശ്യത്തിൽ സഹായിക്കാനാവില്ല. ശബ്ദം, ഹോം, HDMI എന്നിവയെക്കുറിച്ച് ചോദിക്കാം.',
    hi: 'इस अनुरोध में मदद नहीं मिली। आवाज़, Home या HDMI के बारे में पूछें।',
    ta: 'இந்தக் கோரிக்கைக்கு உதவ முடியவில்லை. ஒலி, Home அல்லது HDMI பற்றிக் கேளுங்கள்.',
    kn: 'ಈ ವಿನಂತಿಗೆ ಸಹಾಯ ಮಾಡಲು ಆಗುತ್ತಿಲ್ಲ. ಧ್ವನಿ, Home ಅಥವಾ HDMI ಬಗ್ಗೆ ಕೇಳಿ.',
    te: 'ఈ అభ్యర్థనకు సహాయం అందలేదు. శబ్దం, Home లేదా HDMI గురించి అడగండి.',
  },
  malformed: {
    en: 'I couldn’t build a reliable guide this time. Please try again.',
    ml: 'ഇത്തവണ വിശ്വസനീയമായ ഗൈഡ് ഉണ്ടാക്കാനായില്ല. വീണ്ടും ശ്രമിക്കുക.',
    hi: 'भरोसेमंद गाइड नहीं बन सकी। फिर कोशिश करें।',
    ta: 'நம்பகமான வழிகாட்டி உருவாகவில்லை. மீண்டும் முயலவும்.',
    kn: 'ನಂಬಲರ್ಹ ಮಾರ್ಗದರ್ಶಿ ರಚಿಸಲಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
    te: 'నమ్మదగిన గైడ్ తయారు కాలేదు. మళ్లీ ప్రయత్నించండి.',
  },
  unavailable: {
    en: 'The guide service is unavailable right now. Please try again shortly.',
    ml: 'ഗൈഡ് സേവനം ഇപ്പോൾ ലഭ്യമല്ല. അൽപ്പസമയം കഴിഞ്ഞ് ശ്രമിക്കുക.',
    hi: 'गाइड सेवा अभी उपलब्ध नहीं है। थोड़ी देर बाद कोशिश करें।',
    ta: 'வழிகாட்டி சேவை இப்போது கிடைக்கவில்லை. சிறிது நேரம் கழித்து முயலவும்.',
    kn: 'ಮಾರ್ಗದರ್ಶಿ ಸೇವೆ ಈಗ ಲಭ್ಯವಿಲ್ಲ. ಸ್ವಲ್ಪ ಸಮಯದ ನಂತರ ಪ್ರಯತ್ನಿಸಿ.',
    te: 'గైడ్ సేవ ఇప్పుడు అందుబాటులో లేదు. కాసేపటికి ప్రయత్నించండి.',
  },
  rejected: {
    en: 'The service could not process this request. Try again or rephrase the task.',
    ml: 'സേവനത്തിന് ഈ ആവശ്യം പരിഗണിക്കാനായില്ല. വീണ്ടും ശ്രമിക്കുക, അല്ലെങ്കിൽ വേറെ രീതിയിൽ പറയുക.',
    hi: 'अनुरोध पूरा नहीं हुआ। फिर कोशिश करें या दूसरे शब्दों में लिखें।',
    ta: 'கோரிக்கையைச் செயலாக்க முடியவில்லை. மீண்டும் முயலவும் அல்லது வேறுவிதமாக எழுதவும்.',
    kn: 'ವಿನಂತಿ ಪೂರ್ಣಗೊಳಿಸಲಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ ಅಥವಾ ಬೇರೆ ಪದಗಳಲ್ಲಿ ಬರೆಯಿರಿ.',
    te: 'అభ్యర్థన పూర్తికాలేదు. మళ్లీ ప్రయత్నించండి లేదా మరోలా రాయండి.',
  },
  not_configured: {
    en: 'Live guides are not set up on this server yet.',
    ml: 'ഈ സെർവറിൽ ലൈവ് ഗൈഡുകൾ ഇതുവരെ സജ്ജമാക്കിയിട്ടില്ല.',
    hi: 'इस सर्वर पर लाइव गाइड अभी सेट नहीं हैं।',
    ta: 'இந்தச் சேவையகத்தில் நேரடி வழிகாட்டிகள் இன்னும் அமைக்கப்படவில்லை.',
    kn: 'ಈ ಸರ್ವರ್‌ನಲ್ಲಿ ಲೈವ್ ಮಾರ್ಗದರ್ಶಿ ಇನ್ನೂ ಸಿದ್ಧವಾಗಿಲ್ಲ.',
    te: 'ఈ సర్వర్‌లో లైవ్ గైడ్‌లు ఇంకా సిద్ధంగా లేవు.',
  },
  too_large: {
    en: 'The upload is too large.',
    ml: 'അപ്‌ലോഡ് വളരെ വലുതാണ്.',
    hi: 'अपलोड की गई फ़ाइल बहुत बड़ी है।',
    ta: 'பதிவேற்றிய கோப்பு மிகப் பெரியது.',
    kn: 'ಅಪ್‌ಲೋಡ್ ಮಾಡಿದ ಫೈಲ್ ತುಂಬಾ ದೊಡ್ಡದು.',
    te: 'అప్‌లోడ్ చేసిన ఫైలు చాలా పెద్దది.',
  },
};
