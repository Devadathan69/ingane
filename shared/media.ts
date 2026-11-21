/** Upload and recording limits shared by the photo flow and Family Guides. */
export const MEDIA_LIMITS = {
  imageBytes: 4 * 1024 * 1024,
  imageMinSide: 200,
  imageMaxSide: 2048,
  audioBytes: 1.5 * 1024 * 1024,
  recordingSeconds: 15,
} as const;
