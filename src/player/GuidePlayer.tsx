import { lazy, Suspense, type ComponentType } from 'react';
import { isUiLocale, type GuideLanguage } from '../../shared/languages';
import { STRINGS, type Strings } from '../i18n';
import { StepPlayer, type StepPlayerProps } from './StepPlayer';

type Props = Omit<StepPlayerProps, 't'>;
type ReaderCopy = Pick<Strings, 'stepOf' | 'press' | 'remoteView' | 'photoUnavailable' | 'fullRemote' | 'buttonDetail'
  | 'showPress' | 'showButton' | 'screenDifferent' | 'onTv' | 'checkpoint' | 'yes' | 'back' | 'restart' | 'retry'
  | 'mismatchTitle' | 'mismatchNote' | 'doneTitle' | 'doneBody' | 'play' | 'replay' | 'audioLoading' | 'audioFailed'
  | 'beforeYouStart' | 'guidesNote' | 'photoHint' | 'ringLegend'> & { practice: string; fromPhoto: string };
export type { ReaderCopy };

function reader(load: () => Promise<{ default: ReaderCopy }>) {
  return lazy(async () => {
    const copy = (await load()).default;
    return { default: (p: Props) => <StepPlayer {...p}
      image={{ ...p.image, alt: copy.remoteView }}
      badge={p.badge && { ...p.badge, text: p.badge.tone === 'live' ? copy.fromPhoto : copy.practice }}
      t={{ ...STRINGS.en, ...copy }} /> };
  });
}
const readers = {
  hi: reader(() => import('./languages/hi')), ta: reader(() => import('./languages/ta')),
  kn: reader(() => import('./languages/kn')), te: reader(() => import('./languages/te')),
} satisfies Record<Exclude<GuideLanguage, 'en' | 'ml'>, ComponentType<Props>>;

/** Only the chosen recipient language is fetched. The surrounding application keeps its own language. */
export function GuidePlayer({ family = false, ...props }: Props & { family?: boolean }) {
  const l = props.locale;
  if (isUiLocale(l)) return <StepPlayer {...props} t={family ? { ...STRINGS[l], restart: l === 'ml' ? 'വീണ്ടും തുടങ്ങുക' : 'Start again', doneTitle: l === 'en' ? 'Done' : STRINGS.ml.doneTitle } : STRINGS[l]} />;
  const Reader = readers[l];
  return <Suspense fallback={<p role="status" aria-busy="true">…</p>}><Reader {...props} /></Suspense>;
}
