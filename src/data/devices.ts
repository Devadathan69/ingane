import type { Device } from './types';

export const practiceRemote: Device = {
  id: 'coolux-practice',
  name: { en: 'CooLux practice remote', ml: 'പരിശീലനത്തിനുള്ള CooLux റിമോട്ട്' },
  image: 'devices/coolux-practice.jpg',
  width: 315, height: 1365,
  imageAlt: {
    en: 'Black CooLux remote. SOURCE is between TV and HDMI. MUTE is between the blue rockers. Four arrows surround the centre Enter key.',
    ml: 'കറുത്ത CooLux റിമോട്ട്. TV, HDMI ബട്ടണുകൾക്കിടയിൽ SOURCE. നീല ബട്ടണുകൾക്കിടയിൽ MUTE. നടുവിലെ Enter ബട്ടണിന് ചുറ്റും നാല് അമ്പുകൾ.',
  },
};

export const DEVICES: Record<string, Device> = { [practiceRemote.id]: practiceRemote };
