// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { loadConfig } from './config';

afterEach(() => vi.unstubAllGlobals());

const observation = { isRemote: true, photoQuality: 'good', controls: [], deviceCandidates: [] };
const image = { bytes: Buffer.alloc(32), mime: 'image/png' as const, width: 256, height: 256 };

it.each([
  [{}, 'gpt-6.2-astra', 'gpt-6.2-astra', 'medium'],
  [{ OPENAI_MODEL: 'gpt-6-luna' }, 'gpt-5.5', 'gpt-6-luna', undefined],
  [{ OPENAI_MODEL: 'gpt-6.2-astra', OPENAI_VISION_MODEL: 'gpt-5.5' }, 'gpt-5.5', 'gpt-6.2-astra', 'medium'],
] as const)('uses the flagship by default without overriding configured models (%o)', async (env, vision, planner, planEffort) => {
  const prompt = { taskType: 'go_home', taskSummary: 'Home', decision: 'unsupported',
    clarification: null, unsupportedReason: 'mock', evidenceRefIds: [], steps: [] };
  const sent: { model: string; reasoning?: { effort: string }; store: boolean }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)));
    return Response.json({ status: 'completed', output: [{ type: 'message', role: 'assistant',
      content: [{ type: 'output_text', text: JSON.stringify(sent.length === 1 ? observation : prompt), annotations: [] }] }] });
  }));
  const provider = loadConfig({ OPENAI_API_KEY: 'test-transport-only', ...env }).guide!;
  const signal = new AbortController().signal;
  await provider.analyzeRemote(image, signal, 'Home');
  await provider.plan({ locale: 'en', request: 'Home', controls: [], deviceCandidates: [], references: [], screen: null }, signal);
  expect(sent.map(body => body.model)).toEqual([vision, planner]);
  expect(sent.map(body => body.reasoning?.effort)).toEqual(['low', planEffort]);
  expect(sent.every(body => body.store === false)).toBe(true);
});
