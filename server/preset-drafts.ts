import { REGISTRY_VERSION, type PresetRegistry } from '../src/data/presets/types';

/** Research intake only. This module is never imported by the catalog or the narration service. */
export const draftRegistry: PresetRegistry = {
  version: REGISTRY_VERSION,
  sources: [
    { id: 'samsung-research', title: 'Samsung TV Remote Reference, supplied research brief', location: 'Ingane_Samsung_TV_Remotes.docx' },
    { id: 'samsung-accessory-in', title: 'Samsung India SolarCell accessory listing', location: 'https://www.samsung.com/in/tv-accessories/solar-tv-remote-bn59-01500g/' },
    { id: 'samsung-model-in', title: 'Samsung India Q60D model support', location: 'https://www.samsung.com/in/support/model/QA55Q60DAULXL/' },
  ],
  remotes: [{
    id: 'samsung-in-bn59-01500g', brand: 'Samsung', market: 'IN', partNumber: 'BN59-01500G',
    layoutVariant: { en: 'SolarCell, front layout awaiting inspection', ml: 'SolarCell, മുൻവശത്തെ ബട്ടണുകൾ പരിശോധിക്കാനുണ്ട്' },
    asset: null, controls: {}, status: 'draft', verifiedOn: null, sourceIds: ['samsung-research', 'samsung-accessory-in'],
  }],
  tvs: [{
    id: 'samsung-in-qa55q60daulxl', brand: 'Samsung', market: 'IN', modelCode: 'QA55Q60DAULXL',
    os: 'Tizen', menuVariant: null, remoteIds: ['samsung-in-bn59-01500g'],
    status: 'draft', verifiedOn: null, sourceIds: ['samsung-research', 'samsung-model-in', 'samsung-accessory-in'],
  }],
  guides: [],
};
