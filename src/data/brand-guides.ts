/** Manufacturer reading guides. These records do not assert a tested remote or contain hotspots. */
export interface BrandGuide {
  title: 'hdmi' | 'sound' | 'manual' | 'port';
  model?: string;
  steps: readonly BrandStep[];
  source: string;
}

export type BrandStep = 'checkPort' | 'matchPort' | 'samsungInputs' | 'inputButton' | 'tclInputs'
  | 'xiaomiInputs' | 'volume' | 'volumeUp' | 'speaker' | 'modelLabel' | 'manualPick' | 'manualFind' | 'notePort';

export interface TvBrand {
  id: string;
  name: string;
  guides: readonly BrandGuide[];
}

export const tvBrands: readonly TvBrand[] = [
  { id: 'samsung', name: 'Samsung', guides: [
    { title: 'hdmi', model: 'Smart Hub · Connected Devices', steps: ['checkPort', 'samsungInputs', 'matchPort'],
      source: 'https://www.samsung.com/in/support/tv-audio-video/connect-external-video-devices-and-switch-input-sources-on-a-samsung-smart-tv/' },
  ] },
  { id: 'lg', name: 'LG', guides: [
    { title: 'hdmi', model: 'External Input', steps: ['checkPort', 'inputButton', 'matchPort'],
      source: 'https://www.lg.com/in/support/product-support/troubleshoot/help-library/cs-CT52006584-20153123680022LST/' },
  ] },
  { id: 'sony', name: 'Sony', guides: [
    { title: 'hdmi', model: 'INPUT', steps: ['checkPort', 'inputButton', 'matchPort'],
      source: 'https://www.sony.co.in/electronics/support/articles/00225436' },
  ] },
  { id: 'tcl', name: 'TCL', guides: [
    { title: 'hdmi', model: 'Home · Input', steps: ['checkPort', 'tclInputs', 'matchPort'],
      source: 'https://www.tcl.com/in/en/support-tv/faq/2479' },
    { title: 'sound', steps: ['volume', 'volumeUp', 'speaker'], source: 'https://www.tcl.com/in/en/support-tv/faq/2609' },
  ] },
  { id: 'hisense', name: 'Hisense', guides: [
    { title: 'port', model: '43E63N', steps: ['checkPort', 'notePort'],
      source: 'https://www.hisense-india.com/tv-series/uhd-tv/hisense-108-cm-43-inch-4k-smart-led-ultra-hd-tv-43e63n' },
    { title: 'manual', steps: ['modelLabel', 'manualPick', 'manualFind'],
      source: 'https://www.hisense-india.com/support/product-manuals' },
  ] },
  { id: 'xiaomi', name: 'Xiaomi', guides: [
    { title: 'hdmi', model: 'Xiaomi TV A 43 2025', steps: ['checkPort', 'xiaomiInputs', 'matchPort'],
      source: 'https://www.mi.com/global/support/faq/details/KA-425390/' },
  ] },
];

export const findBrand = (id: string | null) => tvBrands.find(b => b.id === id);
