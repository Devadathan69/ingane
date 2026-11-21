export type { UiLocale as Locale } from '../../shared/languages';
export { authoredLocales as LOCALES } from '../../shared/languages';
import type { AuthoredLocale } from '../../shared/languages';

export type LocalizedText = Record<AuthoredLocale, string>;

/** Normalized rectangle on the final, oriented device image. All values in [0,1]. */
export interface Hotspot {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Device {
  id: string;
  name: LocalizedText;
  image: string;
  /** Intrinsic pixel size of the final oriented asset. */
  width: number;
  height: number;
  imageAlt: LocalizedText;
}

export interface GuideStep {
  id: string;
  image: string;
  hotspot?: Hotspot;
  /** Physical button named in text so the ring is never the only cue. */
  button: LocalizedText;
  instruction: LocalizedText;
  expected: LocalizedText;
  recovery: LocalizedText;
  audio?: Partial<Record<AuthoredLocale, string>>;
}

/**
 * unverified: written from a photo, never confirmed on the real device.
 * verified: owner confirmed button, starting screen, menu and outcome on the device.
 */
export type VerificationStatus = 'unverified' | 'verified';

export interface Guide {
  id: string;
  deviceId: string;
  title: LocalizedText;
  verification: VerificationStatus;
  /** Free-text note on what was (or was not) checked on the device. */
  verificationNote: LocalizedText;
  startingScreen: LocalizedText;
  steps: GuideStep[];
}
