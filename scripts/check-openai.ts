import { loadConfig } from '../server/config';
import { checkImage } from '../server/media';
import { ProviderError } from '../server/providers/types';

// An original 256 × 256 checkerboard. This check never reads the photo library.
const checkerboard = 'iVBORw0KGgoAAAANSUhEUgAAAQAAAAEAAQAAAAB0CZXLAAAAQklEQVR42u3WoREAAAgDse6/NLAAnjuCwURVfWouc9sPAABvgS0AANi+DQAA0A8AAOgHAAD0AwAA+gEAAP0AAMAx0Ipp8OIgbPf4AAAAAElFTkSuQmCC';
const config = loadConfig();

if (config.guide?.name !== 'live') {
  console.error('Set INGANE_PROVIDER=live and save OPENAI_API_KEY in .env, then run this check again.');
  process.exitCode = 1;
} else {
  const sample = checkImage(Buffer.from(checkerboard, 'base64'));
  if (!sample.ok) throw new Error('The bundled test image is invalid.');
  try {
    const observation = await config.guide.analyzeRemote(sample.image, AbortSignal.timeout(config.requestTimeoutMs));
    if (observation.isRemote || observation.controls.length) {
      console.error('OpenAI answered, but identified remote controls on a checkerboard. The vision check failed.');
      process.exitCode = 1;
    } else {
      console.log('OpenAI accepted the test image and correctly reported no remote controls. The photo connection works.');
    }
  } catch (error) {
    console.error(error instanceof ProviderError ? error.message : 'Could not complete the OpenAI connection check.');
    process.exitCode = 1;
  }
}
