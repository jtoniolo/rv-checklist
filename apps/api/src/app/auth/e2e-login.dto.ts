import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * `POST /auth/e2e-login` body (issue #156) — just the email to sign in as. No
 * password, no Google credential: the endpoint itself is the secret, gated
 * behind `E2E_TEST_AUTH` and never enabled outside the Playwright suite.
 */
export const E2eLoginSchema = z.object({ email: z.email() });

export class E2eLoginDto extends createZodDto(E2eLoginSchema) {}
