import { practiceRemote } from './devices';
import { catalogEntries, presetText, stepsFor } from './presets/catalog';
import { presetRegistry } from './presets/registry';
import type { Guide, LocalizedText } from './types';

const entry = catalogEntries(presetRegistry, 'demo').find(item => item.remote.id === 'coolux-practice-layout');
export const GUIDES: Record<string, Guide> = {};

if (entry) {
  for (const template of entry.guides) {
    const port = template.task === 'switch_hdmi' ? 'HDMI 2' : null;
    const id = port ? 'practice-hdmi' : 'practice-unmute';
    const route = stepsFor(template, port);
    if (!route) continue;
    const copy = (text: LocalizedText) => ({ en: presetText(text, 'en', port), ml: presetText(text, 'ml', port) });
    GUIDES[id] = {
      id, deviceId: practiceRemote.id, title: copy(template.playTitle ?? template.title), verification: 'unverified',
      verificationNote: {
        en: 'Practice on the pictured remote with an example TV menu.',
        ml: 'ചിത്രത്തിലുള്ള റിമോട്ടും മാതൃകാ ടിവി മെനുവും ഉപയോഗിച്ചുള്ള പരിശീലനം.',
      },
      startingScreen: copy(template.startingState),
      steps: route.map(step => {
        const control = entry.remote.controls[step.controlId];
        return {
          id: step.id, image: practiceRemote.image, hotspot: control.hotspot, button: control.label,
          instruction: copy(step.instruction), expected: copy(step.expected), recovery: copy(step.recovery),
        };
      }),
    };
  }
}
