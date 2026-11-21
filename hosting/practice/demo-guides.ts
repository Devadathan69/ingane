import type { PresetStep, TaskGuide } from './types';

const demo = {
  tvId: 'demo-tv', remoteId: 'coolux-practice-layout', status: 'demo' as const,
  verifiedOn: null, sourceIds: ['coolux-photo', 'demo-menu'],
};

// This example picker opens on TV, followed vertically by HDMI 1 and HDMI 2.
// Each press moves one row. Both routes check each intermediate highlight.
function downTo(port: 'HDMI 1' | 'HDMI 2'): PresetStep {
  return {
    id: port === 'HDMI 1' ? 'focus-first' : 'focus-second', controlId: 'down', gesture: 'press',
    instruction: { en: 'Press the Down arrow once.', ml: 'താഴോട്ടുള്ള അമ്പ് ഒരു തവണ അമർത്തുക.' },
    narration: {
      en: `Press Down once. Is ${port} highlighted?`,
      ml: `താഴോട്ടുള്ള അമ്പ് ഒരു തവണ അമർത്തുക. ${port} ആണോ തെളിഞ്ഞു കാണുന്നത്?`,
    },
    expected: { en: `Is ${port} highlighted in the list?`, ml: `ലിസ്റ്റിൽ ${port} ആണോ തെളിഞ്ഞു കാണുന്നത്?` },
    confirmation: { en: `I see ${port} highlighted`, ml: `${port} തെളിഞ്ഞു കാണുന്നു` },
    recovery: {
      en: 'Check which row is highlighted. If the order is different, recheck the model or use photo guidance.',
      ml: 'ഏത് വരിയാണ് തെളിഞ്ഞു നിൽക്കുന്നതെന്ന് നോക്കുക. ക്രമം വ്യത്യസ്തമാണെങ്കിൽ മോഡൽ വീണ്ടും പരിശോധിക്കുകയോ ഫോട്ടോ ഉപയോഗിക്കുകയോ ചെയ്യുക.',
    },
  };
}

export const demoGuides: TaskGuide[] = [
  {
    ...demo, id: 'demo-hdmi', task: 'switch_hdmi',
    title: { en: 'Switch to HDMI', ml: 'HDMI-യിലേക്ക് മാറുക' },
    playTitle: { en: 'Switch to {port}', ml: '{port}-ലേക്ക് മാറാം' },
    startingState: {
      en: 'The example TV is showing a channel. The external device is on and connected to {port}.',
      ml: 'ഡെമോ ടിവിയിൽ ഒരു ചാനൽ കാണിക്കുന്നു. പുറത്തെ ഉപകരണം ഓണാണ്. അതിന്റെ കേബിൾ {port} പോർട്ടിലാണ്.',
    },
    input: {
      kind: 'hdmi-port',
      routes: {
        'HDMI 1': ['open-inputs', 'focus-first', 'select-input'],
        'HDMI 2': ['open-inputs', 'focus-first', 'focus-second', 'select-input'],
      },
    },
    steps: [
      {
        id: 'open-inputs', controlId: 'input', gesture: 'press',
        instruction: { en: 'Press SOURCE once.', ml: 'SOURCE ബട്ടൺ ഒരുതവണ അമർത്തൂ.' },
        confirmation: { en: 'I see the input list', ml: 'ഇൻപുട്ട് ലിസ്റ്റ് കാണുന്നു' },
        narration: {
          en: 'Press SOURCE once. Do you see the input list with TV highlighted?',
          ml: 'SOURCE ഒരു തവണ അമർത്തുക. ഇൻപുട്ട് ലിസ്റ്റിൽ TV തെളിഞ്ഞു കാണുന്നുണ്ടോ?',
        },
        expected: { en: 'Do you see the input list with TV highlighted?', ml: 'ഇൻപുട്ട് ലിസ്റ്റിൽ TV തെളിഞ്ഞു കാണുന്നുണ്ടോ?' },
        recovery: {
          en: 'Look for SOURCE between TV and HDMI. If another menu opened, recheck the layout.',
          ml: 'TV, HDMI ബട്ടണുകൾക്കിടയിൽ SOURCE നോക്കുക. വേറൊരു മെനുവാണ് തുറന്നതെങ്കിൽ റിമോട്ടിലെ ബട്ടണുകളുടെ ക്രമം വീണ്ടും പരിശോധിക്കുക.',
        },
      },
      downTo('HDMI 1'), downTo('HDMI 2'),
      {
        id: 'select-input', controlId: 'ok', gesture: 'press',
        confirmation: { en: 'I see the device picture', ml: 'ഉപകരണത്തിലെ ചിത്രം കാണുന്നു' },
        instruction: { en: 'Press the centre Enter button once to select {port}.', ml: '{port} തിരഞ്ഞെടുക്കാൻ നടുവിലെ Enter ബട്ടൺ ഒരു തവണ അമർത്തുക.' },
        narration: {
          en: 'Press the centre Enter button once. Can you see the device connected to {port}?',
          ml: 'നടുവിലെ Enter ബട്ടൺ ഒരു തവണ അമർത്തുക. {port} പോർട്ടിൽ ഘടിപ്പിച്ച ഉപകരണത്തിലെ ചിത്രം കാണുന്നുണ്ടോ?',
        },
        expected: { en: 'Can you see the picture from the device connected to {port}?', ml: '{port} പോർട്ടിൽ ഘടിപ്പിച്ച ഉപകരണത്തിലെ ചിത്രം കാണുന്നുണ്ടോ?' },
        recovery: {
          en: 'If the screen says “No signal”, check the cable label and that the connected device is on.',
          ml: '“No signal” എന്ന് കാണിച്ചാൽ കേബിളിനടുത്തുള്ള പോർട്ടിന്റെ പേര് നോക്കുക. ഘടിപ്പിച്ച ഉപകരണം ഓണാണോയെന്നും പരിശോധിക്കുക.',
        },
      },
    ],
  },
  {
    ...demo, id: 'demo-unmute', task: 'restore_sound', input: { kind: 'none' },
    title: { en: 'Restore muted sound', ml: 'മ്യൂട്ട് ചെയ്ത ശബ്ദം തിരികെ കൊണ്ടുവരുക' },
    startingState: {
      en: 'A programme is playing through the example TV’s own speakers and the crossed-speaker icon is visible.',
      ml: 'ഡെമോ ടിവിയിൽ ഒരു പരിപാടി നടക്കുന്നു. ശബ്ദത്തിനായി ടിവിയുടെ സ്പീക്കറാണ് തിരഞ്ഞെടുത്തിരിക്കുന്നത്. വെട്ടിയ സ്പീക്കർ ചിഹ്നം സ്ക്രീനിൽ കാണാം.',
    },
    steps: [{
      id: 'unmute', controlId: 'mute', gesture: 'press',
      instruction: { en: 'Press the dedicated MUTE button once.', ml: 'MUTE ബട്ടൺ ഒരു തവണ അമർത്തുക.' },
      narration: {
        en: 'Press MUTE once. Can you hear the programme again?',
        ml: 'MUTE ബട്ടൺ ഒരു തവണ അമർത്തുക. പരിപാടിയുടെ ശബ്ദം വീണ്ടും കേൾക്കുന്നുണ്ടോ?',
      },
      expected: { en: 'Has the mute icon cleared, and can you hear the programme?', ml: 'മ്യൂട്ട് ചിഹ്നം മാറിയോ? പരിപാടിയുടെ ശബ്ദം കേൾക്കുന്നുണ്ടോ?' },
      recovery: {
        en: 'Check whether the mute icon is still visible. If sound goes to a soundbar or your remote has a different mute control, use photo guidance.',
        ml: 'മ്യൂട്ട് ചിഹ്നം ഇപ്പോഴും കാണുന്നുണ്ടോ എന്ന് നോക്കുക. സൗണ്ട്ബാറാണ് ഉപയോഗിക്കുന്നതെങ്കിൽ, അല്ലെങ്കിൽ മ്യൂട്ട് ബട്ടൺ വ്യത്യസ്തമാണെങ്കിൽ, ഫോട്ടോ ഉപയോഗിച്ച് സഹായം തേടുക.',
      },
    }],
  },
];
