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
  const sample = guide.verification !== 'verified';
  return (
    <StepPlayer
      legacy
      title={guide.title[locale]}
      subtitle={device.name[locale]}
      badge={{ tone: sample ? 'sample' : 'verified', text: sample ? t.sampleBadge : t.verifiedBadge, note: sample ? guide.verificationNote[locale] : undefined }}
      before={guide.startingScreen[locale]}
      steps={guide.steps.map((s) => ({
        id: s.id,
        hotspot: s.hotspot,
        button: s.button[locale],
        instruction: s.instruction[locale],
        expected: s.expected[locale],
        recovery: s.recovery[locale],
        audioUrl: s.audio?.[locale],
      }))}
      image={{ src: guide.steps[0].image, width: device.width, height: device.height, alt: device.imageAlt[locale] }}
      locale={locale}
      t={t}
    />
  );
}
