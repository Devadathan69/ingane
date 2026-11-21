import { z } from 'zod';
import { familyGuideSchema } from '../../shared/family';

export const identity = z.strictObject({ id: z.string().regex(/^[a-f0-9]{32}$/), revision: z.int().nonnegative() });
export const publication = identity.extend({ guide: familyGuideSchema, permission: z.literal(true) });
