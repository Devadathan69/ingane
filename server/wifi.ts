import type { GuideLocale, GuideStep, ObservedControl } from '../shared/guide';
import { wifiCopy, wifiText } from '../shared/wifi-copy';
import type { ScreenObservation } from './providers/types';

const wifiTerms = /\b(wi[\s-]?fi|wireless network)\b|വൈ[ -]?ഫൈ|वाई[ -]?फ़?फाई|வை[ -]?ஃபை|ವೈ[ -]?ಫೈ|వై[ -]?ఫై/iu;
export const blockedWifi = (task: string) => wifiTerms.test(task) && (
  /\b(?:forget|reset|disable|turn off|reveal|recover|share|hack|bypass|steal|break|crack|disconnect)\b/i.test(task) ||
  /\b(?:show|what is|find|read|tell me)\b.{0,45}\b(?:password|passcode|credentials?)\b/i.test(task) ||
  /ഓഫ്|നിർത്തുക|പാസ്‌?വേഡ്.*(?:കാണി|പറയ)|बंद|முடக்கு|ಆಫ್|ఆఫ్/u.test(task)
);
export const directWifi = (task: string) => wifiTerms.test(task) && !blockedWifi(task);
export const enableOnly = (task: string) => !/\b(?:connect(?:ion)?|join|set[ -]?up)\b|ബന്ധിപ്പി|कनेक्ट|जोड़|இணைக்க|ಸಂಪರ್ಕ|కనెక్ట్/u.test(task)
  && /\b(?:turn(?:ing)? on|switch(?:ing)? on|enable|enabling)\b|\bon\s+(?:aakk\w*|chey\w*|ആ[ക]\S*|ചെയ്യ\S*)|ഓൺ|चालू|இயக்க|ಆನ್|ఆన్/iu.test(task);

const clean = (s: string) => s.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
const levels = [
  /^(?:wi[\s-]?fi|wireless|wireless network|വൈ[ -]?ഫൈ|वाई[ -]?फ़ाई|வை[ -]?ஃபை|ವೈ[ -]?ಫೈ|వై[ -]?ఫై)$/iu,
  /^(?:network (?:&|and) internet|network settings|network|internet|നെറ്റ്‌?വർക്ക്|नेटवर्क और इंटरनेट|நெட்வொர்க் & இணையம்|ನೆಟ್‌?ವರ್ಕ್ ಮತ್ತು ಇಂಟರ್ನೆಟ್|నెట్‌వర్క్ & ఇంటర్నెట్)$/iu,
  /^(?:all settings|settings|ക്രമീകരണങ്ങൾ|സജ്ജീകരണങ്ങൾ|सेटिंग्स|அமைப்புகள்|ಸೆಟ್ಟಿಂಗ್‌?ಗಳು|సెట్టింగ్‌లు)$/iu,
];

export function wifiSteps(locale: GuideLocale, controls: ObservedControl[], screen?: ScreenObservation, enable = false): {
  steps: GuideStep[]; check: ObservedControl[]; advance: boolean; label?: string;
} | null {
  const t = wifiCopy(locale);
  const add = (id: string, control: ObservedControl, label: string | null, instruction: string, expectedState: string): GuideStep => ({
    id, controlId: control.id, screenLabel: label, instruction, narration: instruction, expectedState, mismatchRecovery: t.photo,
  });
  if (!screen) {
    const validSettings = controls.filter(c => c.role === 'settings' && /\b(settings|gear|cog)\b/i.test(c.label));
    const validHome = controls.filter(c => c.role === 'home' && /\b(?:home|house)\b/i.test(c.label));
    const choices = validSettings.length ? validSettings : validHome;
    if (choices.length !== 1) return null;
    const c = choices[0];
    return { steps: [add('wifi-open-menu', c, null, wifiText(t.press, c.label), t.opened)], check: [c], advance: true };
  }
  if (!screen.isTvScreen || screen.isInputList || screen.wifiSensitive) return null;
  const labels = [...new Set(screen.labels.map(s => s.trim()).filter(s => s.length <= 60))];
  for (let index = 0; index < levels.length; index++) {
    const matches = labels.filter(label => levels[index].test(clean(label)));
    if (matches.length !== 1) continue;
    const label = matches[0];
    if (index === 0) {
      // A Wi-Fi row may be a toggle, not a submenu. Pressing it blindly can disable Wi-Fi.
      const instruction = wifiText(enable ? t.enableOnly : t.connectOnly, label);
      return { label, advance: false, check: [], steps: [{ id: 'wifi-finish-on-tv', controlId: null, screenLabel: label,
        instruction, narration: instruction, expectedState: enable ? t.enabled : t.connected, mismatchRecovery: instruction }] };
    }
    const ok = controls.filter(c => c.role === 'ok' && /\b(?:ok|enter|select|center|centre)\b/i.test(c.label));
    const nav = controls.filter(c => c.role === 'nav_ring' && /\b(?:ring|directional|d[ -]?pad|navigation)\b/i.test(c.label));
    if (ok.length !== 1 || (screen.selectedLabel !== label && nav.length !== 1)) return null;
    const steps = [];
    const check = [];
    if (screen.selectedLabel !== label) {
      check.push(nav[0]);
      steps.push(add('wifi-focus-item', nav[0], label, wifiText(t.move, nav[0].label, label), wifiText(t.focused, label)));
    }
    check.push(ok[0]);
    steps.push(add('wifi-select-item', ok[0], label, wifiText(t.select, ok[0].label, label), t.next));
    return { steps, check, advance: true, label };
  }
  return null;
}
