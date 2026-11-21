import { authoredLocale, languages } from '../../shared/languages';
import { PRESET_STRINGS } from '../presets/strings';
import type { Device, Guide, Locale } from '../data';
import type { Strings } from '../i18n';
import { StepPlayer } from './StepPlayer';

interface Props {
  guide: Guide;
  device: Device;
  locale: Locale;
  t: Strings;
}

/** V1 manual guides: fixture data adapted onto the shared StepPlayer. */
export function Player({ guide, device, locale, t }: Props) {
  const content = authoredLocale(locale);
  const sample = guide.verification !== 'verified';
  return (
    <StepPlayer
      legacy
      title={guide.title[content]}
      subtitle={[device.name[content], content !== locale && `${PRESET_STRINGS[locale].language} · ${languages[content].native}`].filter(Boolean).join(' · ')}
      badge={{ tone: sample ? 'sample' : 'verified', text: sample ? t.sampleBadge : t.verifiedBadge, note: sample ? guide.verificationNote[content] : undefined }}
      before={guide.startingScreen[content]}
      steps={guide.steps.map((s) => ({
        id: s.id,
        hotspot: s.hotspot,
        button: s.button[content],
        instruction: s.instruction[content],
        expected: s.expected[content],
        recovery: s.recovery[content],
        audioUrl: s.audio?.[content],
      }))}
      image={{ src: guide.steps[0].image, width: device.width, height: device.height, alt: device.imageAlt[content] }}
      locale={locale}
      contentLocale={content}
      t={t}
    />
  );
}
