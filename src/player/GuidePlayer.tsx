import { STRINGS, type Strings } from '../i18n';
import { FAMILY } from '../family/strings';
import { StepPlayer, type StepPlayerProps } from './StepPlayer';

type ReaderCopy = Pick<Strings, 'stepOf' | 'press' | 'remoteView' | 'photoUnavailable' | 'fullRemote' | 'buttonDetail'
  | 'showPress' | 'showButton' | 'screenDifferent' | 'onTv' | 'checkpoint' | 'yes' | 'back' | 'restart' | 'retry'
  | 'mismatchTitle' | 'mismatchNote' | 'doneTitle' | 'doneBody' | 'play' | 'replay' | 'audioLoading' | 'audioFailed'
  | 'beforeYouStart' | 'guidesNote' | 'photoHint' | 'ringLegend'>;
export type { ReaderCopy };

export function GuidePlayer({ family, ...props }: Omit<StepPlayerProps, 't'> & { family?: boolean }) {
  const copy = STRINGS[props.locale];
  const t = family ? { ...copy, restart: FAMILY[props.locale].restart, doneTitle: props.locale === 'en' ? 'Done' : copy.doneTitle } : copy;
  return <StepPlayer {...props} t={t} />;
}
