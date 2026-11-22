import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
// Smoke the packaged server at its HTTP entry point. All provider calls are intercepted.
if (!process.argv[2]) throw new Error('Pass the hosted deployment package directory.');
const deploy = resolve(process.argv[2]);
process.env.OPENAI_API_KEY = 'test-only-transport-stub';
process.env.SARVAM_API_KEY = 'test-only-transport-stub';
delete process.env.OPENAI_MODEL;
delete process.env.OPENAI_VISION_MODEL;
process.env.INGANE_PROVIDER = 'live';
const calls = [];
const controls = [
  {id:'settings',label:'Settings gear',role:'settings',x:.15,y:.15,w:.1,h:.05,confidence:'high'},
  {id:'ring',label:'directional ring',role:'nav_ring',x:.2,y:.4,w:.2,h:.08,confidence:'high'},
  {id:'ok',label:'OK',role:'ok',x:.2,y:.6,w:.2,h:.08,confidence:'high'},
];
let labels = ['Network & Internet', 'Apps'];
globalThis.fetch = async (target, init) => {
 const url = String(target?.url ?? target);
 if (url.includes('api.sarvam.ai')) {
   const config = JSON.parse(typeof init.body === 'string' ? init.body : await new Response(init.body).text());
   calls.push({model:config.model,type:'speech',language:config.language_code});
   return Response.json({ audios: [Buffer.from('UklGRiYAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQIAAAAAAA==', 'base64').toString('base64')] });
 }
 assert.ok(url.includes('api.openai.com'), 'unexpected network call intercepted');
 const body=JSON.parse(String(init.body));
 const type=body.text.format.name;
 calls.push({model:body.model, type, effort:body.reasoning?.effort});
 const data=type === 'tv_screen'
  ? {isTvScreen:true,isInputList:false,selectedLabel:null,labels,summary:'Settings',wifiSensitive:false}
  : {isRemote:true,photoQuality:'good',controls,deviceCandidates:[]};
 return Response.json({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(data),annotations:[]}]}]});
};
const api=(await import(pathToFileURL(deploy+'/api/index.mjs'))).default;
const image = readFileSync(deploy+'/dist/devices/coolux-practice.jpg');
assert.equal(createHash('sha256').update(image).digest('hex'),'99765fb9cd019e18bc538a166b820830a64a7064ae790185a68bce014fd7b007');
const health=await (await api.fetch(new Request('http://localhost/api/health'))).json();
assert.deepEqual(health,{ok:true,provider:'live',guide:true,speech:true,demo:false});
const guide=async (task, screen=false)=> {
 const body=new FormData();
 for (const [k,v] of Object.entries({consent:'true',locale:'en',request:task,answers:'{}'})) body.set(k,v);
 body.set('image',new Blob([image],{type:'image/jpeg'}),'licensed-fixture.jpg');
 if (screen) body.set('screenImage',new Blob([image],{type:'image/jpeg'}),'licensed-fixture.jpg');
 const reply=await api.fetch(new Request('http://localhost/api/guide',{method:'POST',body}));
 const json=await reply.json();
 assert.equal(reply.status,200,JSON.stringify(json));
 return json;
};
const opener=await guide('Connect TV to Wi-Fi');
assert.equal(opener.wifiAdvance,true);
assert.equal(opener.steps[0].controlId,'settings');
assert.equal(opener.evidenceRefs[0].id,'wifi-open-menu');
const nav=await guide('Connect TV to Wi-Fi',true);
assert.deepEqual(nav.steps.map(x=>[x.controlId,x.screenLabel]),[['ring','Network & Internet'],['ok','Network & Internet']]);
labels=['Wi-Fi','ignored network'];
const final=await guide('Turn on Wi-Fi',true);
assert.equal(final.steps[0].controlId,null);
assert.match(final.steps[0].expectedState,/Wi-Fi is on/);
const signed = opener.steps[0];
const speak=await api.fetch(new Request('http://localhost/api/speak',{method:'POST',headers:{'Content-Type':'application/json'},
 body:JSON.stringify({locale:'en',text:signed.narration,token:opener.narrationTokens[signed.id]})}));
assert.equal(speak.status,200,JSON.stringify(calls));
assert.equal(Buffer.from(await speak.arrayBuffer()).subarray(0,4).toString(),'RIFF');
assert.ok(calls.some(c => c.model === 'gpt-6.2-astra' && c.type === 'remote_controls'));
assert.ok(calls.some(c => c.model === 'gpt-6.2-astra' && c.type === 'tv_screen'));
assert.ok(calls.some(c => c.model === 'bulbul:v3' && c.type === 'speech'));
console.log('Hosted runtime smoke PASS: ',JSON.stringify(calls));
