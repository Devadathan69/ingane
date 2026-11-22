import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GuideMe } from './GuideMe';
import { looksTooDark, normalizePhoto, PhotoError, type NormalizedPhoto } from './photo';
import { GM_STRINGS } from './strings';

vi.mock('./photo', async original => ({
  ...(await original<typeof import('./photo')>()),
  normalizePhoto: vi.fn(),
}));

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const remoteFile = () => new File(['remote'], 'remote.jpg', { type: 'image/jpeg' });
const sample: NormalizedPhoto = { blob: new Blob(['fake JPEG']), url: 'blob:old', width: 600, height: 800, sharpness: 500 };

describe('camera quality recovery', () => {
  it('flags actual underexposure, not a black remote on a lit surface', () => {
    expect(looksTooDark([7, 14, 20, 24, 24, 24, 24, 30, 34, 114])).toBe(true);
    expect(looksTooDark([7, 14, 20, 24, 24, 24, 210, 215, 220, 230])).toBe(false);
  });

  it('warns about low light and lets the user explicitly continue with the same normalized photo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, guide: true, speech: false, demo: false }), { headers: { 'content-type': 'application/json' } })));
    vi.stubGlobal('URL', class { static revokeObjectURL = vi.fn(); });
    vi.mocked(normalizePhoto).mockResolvedValueOnce({ ...sample, lowLight: true });
    const user = userEvent.setup();
    render(<GuideMe locale="en" />);
    await user.upload(screen.getByTestId('camera-input'), remoteFile());
    expect((await screen.findByTestId('dark-warning')).textContent).toBe(GM_STRINGS.en.darkPhoto);
    await user.click(screen.getByRole('button', { name: GM_STRINGS.en.useAnyway }));
    expect(screen.getByRole('heading', { name: GM_STRINGS.en.taskTitle })).toBeTruthy();
  });

  it('removes an old photo when the selected replacement fails and still offers retry and gallery', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, guide: true, speech: false, demo: false }), { headers: { 'content-type': 'application/json' } })));
    vi.stubGlobal('URL', class { static revokeObjectURL = vi.fn(); });
    vi.mocked(normalizePhoto).mockResolvedValueOnce(sample).mockRejectedValueOnce(new PhotoError('unreadable'));
    const user = userEvent.setup();
    render(<GuideMe locale="en" />);
    await user.upload(screen.getByTestId('camera-input'), remoteFile());
    expect(await screen.findByTestId('photo-preview')).toBeTruthy();
    await user.upload(screen.getByTestId('gallery-input'), remoteFile());
    expect((await screen.findByRole('alert')).textContent).toBe(GM_STRINGS.en.errUnreadable);
    expect(screen.queryByTestId('photo-preview')).toBeNull();
    expect(screen.queryByRole('button', { name: GM_STRINGS.en.usePhoto })).toBeNull();
    expect(screen.getByRole('button', { name: GM_STRINGS.en.takePhoto })).toBeTruthy();
    expect(screen.getByRole('button', { name: GM_STRINGS.en.gallery })).toBeTruthy();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(sample.url);
  });
  it('discards a superseded decode even when it completes after the newer photo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, guide: true, speech: false, demo: false }), { headers: { 'content-type': 'application/json' } })));
    vi.stubGlobal('URL', class { static revokeObjectURL = vi.fn(); });
    let finishOlder!: (photo: NormalizedPhoto) => void;
    vi.mocked(normalizePhoto)
      .mockImplementationOnce(() => new Promise(resolve => { finishOlder = resolve; }))
      .mockResolvedValueOnce({ ...sample, url: 'blob:new', width: 800, height: 600 });
    const user = userEvent.setup();
    render(<GuideMe locale="en" />);
    await user.upload(screen.getByTestId('camera-input'), remoteFile());
    await user.upload(screen.getByTestId('gallery-input'), remoteFile());
    expect((await screen.findByTestId('photo-preview')).getAttribute('data-size')).toBe('800x600');
    await act(async () => finishOlder(sample));
    expect(screen.getByTestId('photo-preview').getAttribute('data-size')).toBe('800x600');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(sample.url);
  });
});
