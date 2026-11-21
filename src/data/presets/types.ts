import type { Hotspot, LocalizedText } from '../types';

export const REGISTRY_VERSION = 2;
export type CatalogScope = 'device-verified' | 'demo';

type Evidence = {
  sourceIds: string[];
} & (
  | { status: 'device-verified'; verifiedOn: string }
  | { status: 'demo' | 'draft'; verifiedOn: null }
);

export interface RemoteAsset {
  src: string;
  width: number;
  height: number;
  alt: LocalizedText;
  sha256: string;
  usage: 'local-demo' | 'catalog';
  rights: string;
}

export type RemoteProfile = Evidence & {
  id: string;
  brand: string;
  market: string;
  partNumber: string;
  layoutVariant: LocalizedText;
  asset: RemoteAsset | null;
  controls: Record<string, { label: LocalizedText; shortLabel?: LocalizedText; hotspot: Hotspot }>;
};

export type TvProfile = Evidence & {
  id: string;
  brand: string;
  modelCode: string;
  market: string;
  os: string;
  /** Exact software build or an identifiable menu variant. Null only during research. */
  menuVariant: string | null;
  remoteIds: string[];
};

export interface PresetStep {
  id: string;
  controlId: string;
  gesture: 'press' | 'rocker-press' | 'double-press';
  instruction: LocalizedText;
  narration: LocalizedText;
  expected: LocalizedText;
  confirmation?: LocalizedText;
  recovery: LocalizedText;
}

export type TaskGuide = Evidence & {
  id: string;
  tvId: string;
  remoteId: string;
  title: LocalizedText;
  playTitle?: LocalizedText;
  startingState: LocalizedText;
  steps: PresetStep[];
} & (
  | { task: 'switch_hdmi'; input: { kind: 'hdmi-port'; routes: Record<string, string[]> } }
  | { task: 'restore_sound'; input: { kind: 'none' } }
);

export interface PresetRegistry {
  version: typeof REGISTRY_VERSION;
  sources: { id: string; title: string; location: string }[];
  remotes: RemoteProfile[];
  tvs: TvProfile[];
  guides: TaskGuide[];
}

export interface CatalogEntry {
  tv: TvProfile;
  remote: RemoteProfile & { asset: RemoteAsset };
  guides: TaskGuide[];
}

/** Only these selectors cross the wire when someone taps Play on a preset. */
export interface PresetNarration {
  version: typeof REGISTRY_VERSION;
  scope: CatalogScope;
  guideId: string;
  stepId: string;
  port: string | null;
}
