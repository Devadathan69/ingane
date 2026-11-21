export function PhotoInputs({ onFile, camRef, galRef }: { onFile: (f: File) => void; camRef: React.RefObject<HTMLInputElement | null>; galRef: React.RefObject<HTMLInputElement | null> }) {
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) onFile(f);
  };
  return (
    <>
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={pick} data-testid="camera-input" />
      <input ref={galRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" hidden onChange={pick} data-testid="gallery-input" />
    </>
  );
}
