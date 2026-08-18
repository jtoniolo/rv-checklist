/* eslint-disable @typescript-eslint/unbound-method -- jest mock assertions on mock objects */
import { createHmac } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import type { IOAuthStore, AuthorizationCode } from '@rekog/mcp-nest-auth';
import { of, lastValueFrom } from 'rxjs';
import {
  OAuthGrantService,
  RefreshTokenReuseError,
  RevokedGrantError,
  UnknownRefreshTokenError,
} from './oauth-grant.service.js';
import { TokenGrantInterceptor } from './token-grant.interceptor.js';

const JWT_SECRET = 'test-secret-at-least-32-chars-long!!';
const GRANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function makeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
  ).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${sig}`;
}

function decodePayload(token: string): Record<string, unknown> {
  const [, payloadB64] = token.split('.', 3);
  return JSON.parse(
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- JWT has three parts
    Buffer.from(payloadB64!, 'base64url').toString(),
  ) as Record<string, unknown>;
}

function fakeGrantService(overrides: Record<string, unknown> = {}) {
  return {
    createGrant: jest.fn().mockResolvedValue(GRANT_ID),
    recordRefreshToken: jest.fn().mockResolvedValue(undefined),
    spendRefreshToken: jest
      .fn()
      .mockResolvedValue({ grantId: GRANT_ID, generation: 1 }),
    revokeGrant: jest.fn().mockResolvedValue(undefined),
    hashToken: jest.fn().mockReturnValue('hash'),
    ...overrides,
  } as unknown as OAuthGrantService;
}

function fakeStore(authCode?: Partial<AuthorizationCode>): IOAuthStore {
  return {
    getAuthCode: jest.fn().mockResolvedValue(
      authCode
        ? {
            redirect_uri: 'https://example.com/cb',
            ...authCode,
          }
        : undefined,
    ),
  } as unknown as IOAuthStore;
}

function makeContext(
  method: string,
  path: string,
  body: Record<string, string>,
) {
  const req = {
    method,
    path,
    body,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  };
  return {
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as unknown as import('@nestjs/common').ExecutionContext;
}

function makeCallHandler(response: unknown) {
  return {
    handle: () => of(response),
  } as import('@nestjs/common').CallHandler;
}

function buildInterceptor(
  grantService?: OAuthGrantService,
  store?: IOAuthStore,
) {
  return new TokenGrantInterceptor(
    grantService ?? fakeGrantService(),
    store ?? fakeStore(),
    { jwtSecret: JWT_SECRET },
  );
}

const THIRTY_DAYS_S = 2_592_000;

describe('TokenGrantInterceptor', () => {
  describe('non-token requests', () => {
    it('passes through GET requests unchanged', async () => {
      const interceptor = buildInterceptor();
      const ctx = makeContext('GET', '/api/mcp', {});
      const handler = makeCallHandler({ data: 1 });

      const obs = await interceptor.intercept(ctx, handler);
      const result = await lastValueFrom(obs);

      expect(result).toEqual({ data: 1 });
    });

    it('passes through POST to non-token paths unchanged', async () => {
      const interceptor = buildInterceptor();
      const ctx = makeContext('POST', '/api/register', {});
      const handler = makeCallHandler({ client_id: 'x' });

      const obs = await interceptor.intercept(ctx, handler);
      const result = await lastValueFrom(obs);

      expect(result).toEqual({ client_id: 'x' });
    });
  });

  describe('authorization_code grant', () => {
    const accessToken = makeJwt({
      sub: 'user-1',
      azp: 'client-1',
      scope: 'mcp',
      type: 'access',
    });
    const refreshToken = makeJwt({
      sub: 'user-1',
      client_id: 'client-1',
      type: 'refresh',
    });

    it('creates a grant and adds grant_id to both tokens', async () => {
      const grantSvc = fakeGrantService();
      const store = fakeStore({
        code: 'abc',
        redirect_uri: 'https://example.com/cb',
      });
      const interceptor = buildInterceptor(grantSvc, store);

      const ctx = makeContext('POST', '/api/token', {
        grant_type: 'authorization_code',
        code: 'abc',
        redirect_uri: 'https://example.com/cb',
      });
      const handler = makeCallHandler({
        access_token: accessToken,
        token_type: 'bearer',
        expires_in: THIRTY_DAYS_S,
        refresh_token: refreshToken,
      });

      const obs = await interceptor.intercept(ctx, handler);
      const result = (await lastValueFrom(obs)) as Record<string, unknown>;

      expect(grantSvc.createGrant).toHaveBeenCalledWith(
        'user-1',
        'client-1',
        'mcp',
      );
      expect(grantSvc.recordRefreshToken).toHaveBeenCalledWith(
        GRANT_ID,
        refreshToken,
        1,
      );

      const accessPayload = decodePayload(result['access_token'] as string);
      expect(accessPayload['grant_id']).toBe(GRANT_ID);

      const refreshPayload = decodePayload(result['refresh_token'] as string);
      expect(refreshPayload['grant_id']).toBe(GRANT_ID);
    });

    it('rejects when redirect_uri does not match stored code', async () => {
      const store = fakeStore({
        code: 'abc',
        redirect_uri: 'https://example.com/cb',
      });
      const interceptor = buildInterceptor(fakeGrantService(), store);

      const ctx = makeContext('POST', '/api/token', {
        grant_type: 'authorization_code',
        code: 'abc',
        redirect_uri: 'https://evil.com/cb',
      });
      const handler = makeCallHandler({});

      try {
        await interceptor.intercept(ctx, handler);
        throw new Error('expected to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const response = (error as HttpException).getResponse() as Record<
          string,
          string
        >;
        expect(response['error']).toBe('invalid_grant');
      }
    });

    it('rejects when redirect_uri is missing from token request', async () => {
      const store = fakeStore({
        code: 'abc',
        redirect_uri: 'https://example.com/cb',
      });
      const interceptor = buildInterceptor(fakeGrantService(), store);

      const ctx = makeContext('POST', '/api/token', {
        grant_type: 'authorization_code',
        code: 'abc',
      });
      const handler = makeCallHandler({});

      await expect(interceptor.intercept(ctx, handler)).rejects.toThrow(
        HttpException,
      );
    });
  });

  describe('refresh_token grant', () => {
    const accessToken = makeJwt({
      sub: 'user-1',
      azp: 'client-1',
      type: 'access',
    });
    const newRefreshToken = makeJwt({
      sub: 'user-1',
      client_id: 'client-1',
      type: 'refresh',
      jti: 'new',
    });

    it('records the new refresh token and adds grant_id', async () => {
      const grantSvc = fakeGrantService();
      const interceptor = buildInterceptor(grantSvc);

      const ctx = makeContext('POST', '/api/token', {
        grant_type: 'refresh_token',
        refresh_token: 'old-token',
      });
      const handler = makeCallHandler({
        access_token: accessToken,
        token_type: 'bearer',
        expires_in: THIRTY_DAYS_S,
        refresh_token: newRefreshToken,
      });

      const obs = await interceptor.intercept(ctx, handler);
      const result = (await lastValueFrom(obs)) as Record<string, unknown>;

      expect(grantSvc.spendRefreshToken).toHaveBeenCalledWith('old-token');
      expect(grantSvc.recordRefreshToken).toHaveBeenCalledWith(
        GRANT_ID,
        newRefreshToken,
        2,
      );

      const accessPayload = decodePayload(result['access_token'] as string);
      expect(accessPayload['grant_id']).toBe(GRANT_ID);
    });

    it('rejects a reused refresh token with invalid_grant', async () => {
      const grantSvc = fakeGrantService({
        spendRefreshToken: jest
          .fn()
          .mockRejectedValue(new RefreshTokenReuseError(GRANT_ID)),
      });
      const interceptor = buildInterceptor(grantSvc);

      const ctx = makeContext('POST', '/api/token', {
        grant_type: 'refresh_token',
        refresh_token: 'spent-token',
      });
      const handler = makeCallHandler({});

      try {
        await interceptor.intercept(ctx, handler);
        throw new Error('expected to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const response = (error as HttpException).getResponse() as Record<
          string,
          string
        >;
        expect(response['error']).toBe('invalid_grant');
      }
    });

    it('rejects a refresh token from a revoked grant', async () => {
      const grantSvc = fakeGrantService({
        spendRefreshToken: jest
          .fn()
          .mockRejectedValue(new RevokedGrantError(GRANT_ID)),
      });
      const interceptor = buildInterceptor(grantSvc);

      const ctx = makeContext('POST', '/api/token', {
        grant_type: 'refresh_token',
        refresh_token: 'revoked-token',
      });
      const handler = makeCallHandler({});

      await expect(interceptor.intercept(ctx, handler)).rejects.toThrow(
        HttpException,
      );
    });

    it('passes through an unknown refresh token for library validation', async () => {
      const grantSvc = fakeGrantService({
        spendRefreshToken: jest
          .fn()
          .mockRejectedValue(new UnknownRefreshTokenError()),
      });
      const interceptor = buildInterceptor(grantSvc);

      const ctx = makeContext('POST', '/api/token', {
        grant_type: 'refresh_token',
        refresh_token: 'unknown-token',
      });
      const handler = makeCallHandler({
        access_token: accessToken,
        token_type: 'bearer',
        expires_in: THIRTY_DAYS_S,
      });

      const obs = await interceptor.intercept(ctx, handler);
      const result = (await lastValueFrom(obs)) as Record<string, unknown>;

      expect(result['access_token']).toBe(accessToken);
    });
  });
});
