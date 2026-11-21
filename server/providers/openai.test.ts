// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { createOpenAIProviders } from './openai';

afterEach(() => vi.unstubAllGlobals());

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
