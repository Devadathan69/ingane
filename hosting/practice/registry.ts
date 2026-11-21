import { practiceRemote as photo } from '../devices';
import { demoGuides } from './demo-guides';
import { REGISTRY_VERSION, type PresetRegistry } from './types';

const box = (left: number, top: number, width: number, height: number) => ({
  x: left / photo.width, y: top / photo.height, w: width / photo.width, h: height / photo.height,
});

export const presetRegistry: PresetRegistry = {
  version: REGISTRY_VERSION,
  sources: [
    { id: 'coolux-photo', title: 'CooLux Remote for Samsung LED TV, TaurusEmerald (CC BY-SA 4.0)',
      location: 'https://commons.wikimedia.org/wiki/File:CooLux_Remote_for_Samsung_LED_TV.jpg' },
    { id: 'demo-menu', title: 'Authored two-port practice menu', location: 'src/data/presets/demo-guides.ts' },
  ],
  remotes: [{
    id: 'coolux-practice-layout', brand: 'CooLux', market: 'ZZ', partNumber: 'DEMO-R01',
    status: 'demo', verifiedOn: null, sourceIds: ['coolux-photo'],
    layoutVariant: {
      en: 'SOURCE between TV and HDMI, a dedicated MUTE key, and separate direction and Enter buttons',
      ml: 'TV, HDMI ബട്ടണുകൾക്കിടയിൽ SOURCE, പ്രത്യേക MUTE ബട്ടൺ, വെവ്വേറെ അമ്പുകളും Enter ബട്ടണും',
    },
    asset: {
      src: photo.image, width: photo.width, height: photo.height, alt: photo.imageAlt,
      sha256: '99765fb9cd019e18bc538a166b820830a64a7064ae790185a68bce014fd7b007',
      usage: 'catalog', rights: 'Photo by TaurusEmerald, cropped and resized under CC BY-SA 4.0. See photo-credit.txt.',
    },
    // Pixel edges on the final 315 × 1365 public crop.
    controls: {
      input: { label: { en: 'SOURCE between TV and HDMI', ml: 'TV, HDMI ബട്ടണുകൾക്കിടയിലെ SOURCE' },
        shortLabel: { en: 'SOURCE', ml: 'SOURCE' }, hotspot: box(123, 170, 67, 48) },
      down: { label: { en: 'Down arrow below Enter', ml: 'Enter ബട്ടണിനു താഴെയുള്ള താഴോട്ടുള്ള അമ്പ്' },
        shortLabel: { en: 'Down arrow', ml: 'താഴോട്ടുള്ള അമ്പ്' }, hotspot: box(137, 880, 42, 66) },
      ok: { label: { en: 'Centre Enter button with a bent arrow', ml: 'വളഞ്ഞ അമ്പുള്ള നടുവിലെ Enter ബട്ടൺ' },
        shortLabel: { en: 'Enter', ml: 'Enter' }, hotspot: box(132, 819, 51, 50) },
      mute: { label: { en: 'MUTE between the blue rockers', ml: 'നീല ബട്ടണുകൾക്കിടയിലെ MUTE' },
        shortLabel: { en: 'MUTE', ml: 'MUTE' }, hotspot: box(131, 486, 52, 63) },
    },
  }],
  tvs: [{
    id: 'demo-tv', brand: 'Ingane Demo', modelCode: 'DEMO-TV-01', market: 'ZZ',
    os: 'Demo OS', menuVariant: 'Menu A', remoteIds: ['coolux-practice-layout'],
    status: 'demo', verifiedOn: null, sourceIds: ['demo-menu'],
  }],
  guides: demoGuides,
};
