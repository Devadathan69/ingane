import type { GuideLocale } from '../shared/guide';

/** Low-risk, non-menu advice only. No generated steps, settings changes or remote presses. */
const noSignal: Record<GuideLocale, string> = {
  en: 'If the TV shows “No signal”, check that the connected device is on and its cable is firmly connected. If you know which HDMI port it uses, ask to switch to that port.',
  ml: 'ടിവിയിൽ “No signal” കാണുന്നെങ്കിൽ, ബന്ധിപ്പിച്ച ഉപകരണം ഓൺ ആണോ, കേബിൾ ഉറപ്പായി കണക്റ്റ് ചെയ്തിട്ടുണ്ടോ എന്ന് നോക്കുക. ഏത് HDMI പോർട്ടാണെന്ന് അറിയാമെങ്കിൽ അതിലേക്ക് മാറാൻ ചോദിക്കാം.',
  hi: 'अगर टीवी पर “No signal” दिख रहा है, तो जाँचें कि जुड़ा उपकरण चालू है और केबल ठीक से लगी है। HDMI पोर्ट पता हो तो उस पर जाने के लिए कहें।',
  ta: 'டிவியில் “No signal” தெரிந்தால், இணைத்த சாதனம் இயக்கத்தில் உள்ளதா என்றும் கேபிள் உறுதியாக உள்ளதா என்றும் பாருங்கள். HDMI போர்ட் தெரிந்தால் அதற்கு மாறக் கேளுங்கள்.',
  kn: 'ಟಿವಿಯಲ್ಲಿ “No signal” ಕಾಣಿಸಿದರೆ, ಜೋಡಿಸಿದ ಸಾಧನ ಆನ್ ಆಗಿದೆಯೇ ಮತ್ತು ಕೇಬಲ್ ಸರಿಯಾಗಿ ಜೋಡಿಸಿದೆಯೇ ನೋಡಿ. HDMI ಪೋರ್ಟ್ ಗೊತ್ತಿದ್ದರೆ ಅದಕ್ಕೆ ಬದಲಿಸಲು ಕೇಳಿ.',
  te: 'టీవీలో “No signal” కనిపిస్తే, కనెక్ట్ చేసిన పరికరం ఆన్‌లో ఉందో, కేబుల్ గట్టిగా అమర్చారో చూడండి. HDMI పోర్ట్ తెలిస్తే దానికి మారేందుకు అడగండి.',
};
const remote: Record<GuideLocale, string> = {
  en: 'If none of the remote buttons respond, check that the batteries are fitted in the marked +/− direction and that nothing blocks the front of the TV. Tell me what appears on the TV if it still does not respond.',
  ml: 'റിമോട്ടിലെ ഒരു ബട്ടണും പ്രവർത്തിക്കുന്നില്ലെങ്കിൽ, ബാറ്ററികൾ +/− അടയാളമനുസരിച്ച് ഇട്ടിട്ടുണ്ടോ എന്നും ടിവിയുടെ മുന്നിൽ തടസ്സമുണ്ടോ എന്നും പരിശോധിക്കുക. എന്നിട്ടും പ്രവർത്തിക്കുന്നില്ലെങ്കിൽ ടിവിയിൽ എന്താണ് കാണുന്നതെന്ന് പറയുക.',
  hi: 'अगर कोई बटन काम नहीं करता, तो जाँचें कि बैटरियाँ +/− के निशान के अनुसार लगी हैं और टीवी के सामने कुछ नहीं है। फिर भी काम न करे तो बताएँ कि टीवी पर क्या दिख रहा है।',
  ta: 'ரிமோட்டின் எந்தப் பொத்தானும் வேலை செய்யாவிட்டால், பேட்டரிகள் +/− குறியின்படி உள்ளதா என்றும் டிவியின் முன் தடையில்லையா என்றும் பாருங்கள். இன்னும் வேலை செய்யவில்லை என்றால் திரையில் என்ன தெரிகிறது என்று சொல்லுங்கள்.',
  kn: 'ರಿಮೋಟ್‌ನ ಯಾವ ಗುಂಡಿಯೂ ಕೆಲಸ ಮಾಡದಿದ್ದರೆ, ಬ್ಯಾಟರಿಗಳು +/− ಗುರುತಿನಂತೆ ಇವೆಯೇ ಮತ್ತು ಟಿವಿ ಮುಂದೆ ಅಡ್ಡಿ ಇದೆಯೇ ನೋಡಿ. ಇನ್ನೂ ಕೆಲಸ ಮಾಡದಿದ್ದರೆ ಟಿವಿಯಲ್ಲಿ ಏನು ಕಾಣುತ್ತಿದೆ ಎಂದು ಹೇಳಿ.',
  te: 'రిమోట్‌లో ఏ బటన్ పనిచేయకపోతే బ్యాటరీలు +/− గుర్తుల ప్రకారం ఉన్నాయో, టీవీ ముందు అడ్డంకి లేదో చూడండి. ఇంకా పనిచేయకపోతే టీవీలో ఏమి కనిపిస్తోందో చెప్పండి.',
};
export function troubleshooting(locale: GuideLocale, request: string): string | undefined {
  if (/\bno signal\b/i.test(request)) return noSignal[locale];
  if (/\b(?:remote|buttons?)\b.{0,25}\b(?:not (?:working|responding)|won.t (?:work|respond)|unresponsive|dead)\b|\bremote batteries\b/i.test(request)) return remote[locale];
}
