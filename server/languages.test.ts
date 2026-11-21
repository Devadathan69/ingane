// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { LOCALE, type GuideResult } from '../shared/guide';
import { guideLanguages, languages, uiLanguages } from '../shared/languages';
import { createApp } from './app';
import { loadConfig } from './config';
import { presetNarration } from './presets';
import { silentWav } from './providers/mock';
import { fakeImage } from './test-helpers';
import { validateGuideResult } from './validate';

const commands = [
  ['hi', 'टीवी पर HDMI 2 खोलना है।', /\p{Script=Devanagari}/u],
  ['ta', 'டிவியில் HDMI 2 தேர்வு செய்ய வேண்டும்.', /\p{Script=Tamil}/u],
  ['kn', 'ಟಿವಿಯಲ್ಲಿ HDMI 2 ಆಯ್ಕೆ ಮಾಡಬೇಕು.', /\p{Script=Kannada}/u],
  ['te', 'టీవీలో HDMI 2 తెరవాలి.', /\p{Script=Telugu}/u],
] as const;

describe('guide and speech languages', () => {
  it('offers only reviewed UI languages and keeps the next speech wave out of authoring', () => {
    expect(uiLanguages).toEqual(['ml','en']);
    expect(guideLanguages).toEqual(['ml','en','hi','ta','kn','te']);
    for (const l of ['bn','mr','gu','pa','od'] as const) {
      expect(languages[l].code).toBe(l + '-IN');
      expect(LOCALE.safeParse(l).success).toBe(false);
    }
  });
  it('keeps error messages in the chosen app language when the guide uses a different language', async () => {
    const app = createApp({ config: loadConfig({ INGANE_PROVIDER: 'mock' }) });
    const form = new FormData();
    form.set('locale','ta');
    const res = await app.request('/api/guide', {method:'POST',body:form,headers:{'Accept-Language':'ml'}});
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/\p{Script=Malayalam}/u);
  });
  it.each(commands)('keeps a grounded HDMI 2 visual step, the exact label and native script in %s', async (l, request, script) => {
    const app = createApp({ config: loadConfig({ INGANE_PROVIDER: 'mock' }) });
    const form = new FormData();
    form.set('consent','true'); form.set('locale',l); form.set('request',request);
    const image = new Blob([new Uint8Array(fakeImage().bytes)], {type:'image/png'});
    form.set('image',image,'remote.png'); form.set('screenImage',image,'screen.png');
    form.set('answers',JSON.stringify({confirmedControlIds:['ok']}));
    const res = await app.request('/api/guide', {method:'POST',body:form});
    expect(res.status).toBe(200);
    const result = await res.json() as GuideResult;
    expect(result).toMatchObject({status:'ready',locale:l,demo:true});
    for (const step of result.steps) {
      expect(step.instruction).toMatch(script);
      expect(step.narration).toContain('HDMI 2');
      expect(step.screenLabel).toBe('HDMI 2');
      expect(result.observedControls.some(c=>c.id===step.controlId && c.display==='box')).toBe(true);
    }
    result.steps[0].instruction = 'Choose HDMI 2.';
    expect(validateGuideResult(result,{screenLabels:['HDMI 2']}).join()).toContain(languages[l].name + ' script');
    expect(presetNarration({version:1,scope:'demo',guideId:'demo-hdmi',stepId:'open-inputs',port:'HDMI 2'},l)).toBeUndefined();
  });
  it.each(commands)('uses the official speech SDK wire formats and the chosen voice locale for %s', async (l, command) => {
    const transport=vi.spyOn(globalThis,'fetch').mockImplementation(async (url,init) => {
      const request = new Request(url, init);
      if (request.url.endsWith('/speech-to-text')) {
        const form=await request.formData();
        expect(form.get('model')).toBe('saaras:v4');
        expect(form.get('language_code')).toBe(languages[l].code);
        expect(form.has('keyterms')).toBe(false);
        return Response.json({transcript:command});
      }
      expect(request.url).toMatch(/\/text-to-speech$/);
      expect(await request.json()).toMatchObject({model:'bulbul:v3',speaker:'shubh',language_code:languages[l].code, text:command});
      return Response.json({audios:[silentWav().toString('base64')]});
    });
    try {
      const speech=loadConfig({ SARVAM_API_KEY:'test-transport-only' }).speech!;
      const signal=new AbortController().signal;
      expect(await speech.transcribe({bytes:silentWav(),mime:'audio/wav'},l,signal)).toBe(command);
      expect(await speech.synthesize(command,l,signal)).toEqual(silentWav());
      expect(transport).toHaveBeenCalledTimes(2);
    } finally { transport.mockRestore(); }
  });
});
