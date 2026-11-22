import type { GuideLanguage } from '../../shared/languages';

export const narrationCopy: Record<GuideLanguage, { mute: string; unmute: string; blocked: string }> = {
  en: { mute: 'Mute narration', unmute: 'Turn narration on', blocked: 'Tap to hear' },
  ml: { mute: 'ശബ്ദം ഓഫ് ചെയ്യുക', unmute: 'ശബ്ദം ഓൺ ചെയ്യുക', blocked: 'കേൾക്കാൻ തൊടുക' },
  hi: { mute: 'निर्देशों की आवाज़ बंद करें', unmute: 'निर्देशों की आवाज़ चालू करें', blocked: 'सुनने के लिए टैप करें' },
  ta: { mute: 'வழிகாட்டும் குரலை அணைக்கவும்', unmute: 'வழிகாட்டும் குரலை இயக்கவும்', blocked: 'கேட்கத் தொடவும்' },
  kn: { mute: 'ಸೂಚನೆಗಳ ಧ್ವನಿ ನಿಲ್ಲಿಸಿ', unmute: 'ಸೂಚನೆಗಳ ಧ್ವನಿ ಆನ್ ಮಾಡಿ', blocked: 'ಕೇಳಲು ಟ್ಯಾಪ್ ಮಾಡಿ' },
  te: { mute: 'సూచనల గొంతు ఆపండి', unmute: 'సూచనల గొంతు ఆన్ చేయండి', blocked: 'వినడానికి నొక్కండి' },
};
