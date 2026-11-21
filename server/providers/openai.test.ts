// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { createOpenAIProviders } from './openai';

afterEach(() => vi.unstubAllGlobals());

it('routes photos and TV labels to the vision model and written instructions to the planner', async () => {
  const remote = { isRemote: true, photoQuality: 'good', controls: [], deviceCandidates: [] };
  const screen = { isTvScreen: true, isInputList: true, selectedLabel: null, labels: ['HDMI 2'], summary: 'Input list' };
  const plan = { taskType: 'switch_hdmi', taskSummary: 'Switch inputs', decision: 'needs_clarification',
    clarification: { kind: 'confirm_button', question: 'Is SOURCE visible?', controlId: null },
    unsupportedReason: null, evidenceRefIds: [], steps: [] };
  const replies = [remote, screen, plan];
  const models: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    models.push(body.model);
    return Response.json({ status: 'completed', output: [{ type: 'message', role: 'assistant',
      content: [{ type: 'output_text', text: JSON.stringify(replies.shift()), annotations: [] }] }] });
  }));
  const guide = createOpenAIProviders({ apiKey: 'test-only', model: 'gpt-6-luna', visionModel: 'gpt-5.5', timeoutMs: 2000 });
  const signal = new AbortController().signal;
  const image = { bytes: Buffer.alloc(32), mime: 'image/png' as const, width: 256, height: 256 };
  await guide.analyzeRemote(image, signal);
  await guide.analyzeScreen(image, signal);
  await guide.plan({ locale: 'en', request: 'Switch to HDMI 2', controls: [], deviceCandidates: [], references: [], screen }, signal);
  expect(models).toEqual(['gpt-5.5', 'gpt-5.5', 'gpt-6-luna']);
});

it.each([['gpt-5.5', 'low'], ['gpt-4.1', undefined]])('limits the photo check to the requested task on %s', async (model, effort) => {
  const task = 'ടിവിയിലെ മ്യൂട്ട് മാറ്റണം.';
  const observation = { isRemote: true, photoQuality: 'good', controls: [], deviceCandidates: [] };
  const fetch = vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    expect(body.reasoning?.effort).toBe(effort);
    expect(body.text.format.schema.properties.controls.maxItems).toBe(12);
    expect(body.input[0].content[0].text).toBe(JSON.stringify({ task }));
    expect(body.input[0].content[1].detail).toBe('high');
    return Response.json({ status: 'completed', output: [{ type: 'message', role: 'assistant',
      content: [{ type: 'output_text', text: JSON.stringify(observation), annotations: [] }] }] });
  });
  vi.stubGlobal('fetch', fetch);
  const provider = createOpenAIProviders({ apiKey: 'test-only', model, timeoutMs: 2000 });
  await expect(provider.analyzeRemote({ bytes: Buffer.alloc(32), mime: 'image/png', width: 256, height: 256 },
    new AbortController().signal, task)).resolves.toEqual(observation);
  expect(fetch).toHaveBeenCalledOnce();
});

it('stops a slow photo check at its deadline without starting a second attempt', async () => {
  const fetch = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
    const signal = init.signal!;
    const abort = () => reject(signal.reason);
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  }));
  vi.stubGlobal('fetch', fetch);
  const guide = createOpenAIProviders({ apiKey: 'test-only', model: 'gpt-5.5', timeoutMs: 35 });
  await expect(guide.analyzeRemote({ bytes: Buffer.alloc(32), mime: 'image/png', width: 256, height: 256 },
    new AbortController().signal, 'unmute')).rejects.toMatchObject({ code: 'timeout' });
  expect(fetch).toHaveBeenCalledOnce();
});

it.each([
  [401, 'invalid_api_key', /project key/],
  [403, 'insufficient_permissions', /create Responses/],
  [404, 'model_not_found', /configured model/],
  [429, 'insufficient_quota', /API billing and credits/],
  [429, 'rate_limit_exceeded', /try again later/],
] as const)('explains an OpenAI setup failure safely (%i, %s)', async (status, code, hint) => {
  const fetch = vi.fn(async () => Response.json(
    { error: { message: 'private upstream details', code } },
    { status, headers: { 'x-should-retry': 'false' } },
  ));
  vi.stubGlobal('fetch', fetch);
  const guide = createOpenAIProviders({ apiKey: 'local-test-only', model: 'test-model', timeoutMs: 2000 });
  const request = guide.analyzeRemote(
    { bytes: Buffer.alloc(32), mime: 'image/png', width: 256, height: 256 },
    new AbortController().signal,
  );
  await expect(request).rejects.toThrow(hint);
  await expect(request).rejects.not.toThrow(/private upstream details/);
  expect(fetch).toHaveBeenCalledOnce();
});
