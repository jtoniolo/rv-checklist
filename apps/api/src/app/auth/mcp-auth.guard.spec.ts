import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { ModuleRef } from '@nestjs/core';
import { JwtTokenService, type JwtPayload } from '@rekog/mcp-nest-auth';
import {
  McpTokenStore,
  UserStore,
  type McpTokenRecord,
  type UpsertUserInput,
  type UpsertUserResult,
  type UserRecord,
} from '@rv-checklist/api-data-access';
import { OAuthGrantService } from '../mcp-auth/oauth-grant.service.js';
import { McpAuthGuard } from './mcp-auth.guard.js';
import { TokenService } from './token.service.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const OWNER: UserRecord = {
  id: 'user-1',
  googleSub: 'google-1',
  email: 'owner@example.com',
  name: 'Test Owner',
  picture: 'https://example.com/pic.jpg',
};

const RAW_TOKEN = 'rvmcp_dGhpcyBpcyBhIHRlc3QgdG9rZW4';
const TOKEN_HASH = 'test-hash';

const ACTIVE_RECORD: McpTokenRecord = {
  id: 'tok-1',
  userId: OWNER.id,
  tokenHash: TOKEN_HASH,
  createdAt: new Date('2026-01-01'),
  revokedAt: undefined,
  lastUsedAt: undefined,
};

const SERVER_URL = 'http://localhost:3000';
const RESOURCE_URL = 'http://localhost:3000/api/mcp';
const PRM_URL = `${SERVER_URL}/.well-known/oauth-protected-resource`;

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

class FakeUserStore extends UserStore {
  private readonly record: UserRecord | undefined;
  constructor(record?: UserRecord) {
    super();
    this.record = record;
  }
  findById(id: string): Promise<UserRecord | undefined> {
    return Promise.resolve(this.record?.id === id ? this.record : undefined);
  }
  findByEmail(email: string): Promise<UserRecord | undefined> {
    return Promise.resolve(
      this.record?.email === email ? this.record : undefined,
    );
  }
  upsertByGoogleSub(_input: UpsertUserInput): Promise<UpsertUserResult> {
    throw new Error('not implemented');
  }
}

class FakeMcpTokenStore extends McpTokenStore {
  private readonly record: McpTokenRecord | undefined;
  readonly lastUsedCalls: string[] = [];
  constructor(record?: McpTokenRecord) {
    super();
    this.record = record;
  }
  replaceForUser(): Promise<McpTokenRecord> {
    throw new Error('not implemented');
  }
  findActiveByHash(hash: string): Promise<McpTokenRecord | undefined> {
    return Promise.resolve(
      this.record?.tokenHash === hash ? this.record : undefined,
    );
  }
  findActiveByUser(): Promise<McpTokenRecord | undefined> {
    throw new Error('not implemented');
  }
  revokeForUser(): Promise<void> {
    throw new Error('not implemented');
  }
  updateLastUsed(id: string): Promise<void> {
    this.lastUsedCalls.push(id);
    return Promise.resolve();
  }
}

function fakeTokenService(): TokenService {
  return { hash: () => TOKEN_HASH } as unknown as TokenService;
}

const JWT_PAYLOAD: JwtPayload & { grant_id: string } = {
  sub: 'profile-1',
  type: 'access',
  iss: SERVER_URL,
  aud: RESOURCE_URL,
  user_profile_id: 'profile-1',
  grant_id: 'grant-1',
};

class FakeJwtTokenService {
  private readonly payload: JwtPayload | undefined;
  constructor(payload: JwtPayload | undefined = JWT_PAYLOAD) {
    this.payload = payload;
  }
  validateToken(): JwtPayload | null {
    // eslint-disable-next-line unicorn/no-null -- library return type
    return this.payload ?? null;
  }
}

class FakeOAuthGrantService {
  private readonly isActive: boolean;
  readonly touchCalls: string[] = [];
  constructor(isActive = true) {
    this.isActive = isActive;
  }
  isGrantActive(): Promise<boolean> {
    return Promise.resolve(this.isActive);
  }
  touchLastUsed(grantId: string): Promise<void> {
    this.touchCalls.push(grantId);
    return Promise.resolve();
  }
}

class FakeOAuthStore {
  private readonly profile: { id: string; email?: string } | undefined;
  constructor(profile?: { id: string; email?: string }) {
    this.profile = profile;
  }
  getUserProfileById(): Promise<{ id: string; email?: string } | undefined> {
    return Promise.resolve(this.profile);
  }
}

function fakeModuleRef(
  overrides: Record<string | symbol, unknown> = {},
): ModuleRef {
  const registry = new Map<unknown, unknown>(Object.entries(overrides));
  if (overrides['JwtTokenService']) {
    registry.set(JwtTokenService, overrides['JwtTokenService']);
  }
  if (overrides['OAuthGrantService']) {
    registry.set(OAuthGrantService, overrides['OAuthGrantService']);
  }

  return {
    get(token: unknown) {
      if (registry.has(token)) return registry.get(token);
      throw new Error(`No provider for ${String(token)}`);
    },
  } as unknown as ModuleRef;
}

interface FakeResponse {
  headers: Record<string, string>;
  setHeader(k: string, v: string): void;
}

function makeContext(authorization?: string): {
  ctx: ExecutionContext;
  req: Record<string, unknown>;
  res: FakeResponse;
} {
  const req: Record<string, unknown> = {
    headers: { authorization },
  };
  const headers: Record<string, string> = {};
  const res: FakeResponse = {
    headers,
    setHeader(key: string, value: string) {
      headers[key.toLowerCase()] = value;
    },
  };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ExecutionContext;
  return { ctx, req, res };
}

function buildGuard(
  opts: {
    mcpStore?: FakeMcpTokenStore;
    userStore?: FakeUserStore;
    moduleRefOverrides?: Record<string, unknown>;
  } = {},
): McpAuthGuard {
  return new McpAuthGuard(
    opts.mcpStore ?? new FakeMcpTokenStore(),
    opts.userStore ?? new FakeUserStore(),
    fakeTokenService(),
    fakeModuleRef(opts.moduleRefOverrides ?? {}),
  );
}

function jwtModuleOverrides(
  overrides: {
    jwtService?: FakeJwtTokenService;
    grantService?: FakeOAuthGrantService;
    store?: FakeOAuthStore;
  } = {},
): Record<string, unknown> {
  return {
    JwtTokenService: overrides.jwtService ?? new FakeJwtTokenService(),
    OAUTH_MODULE_OPTIONS: {
      serverUrl: SERVER_URL,
      resource: RESOURCE_URL,
    },
    OAuthGrantService: overrides.grantService ?? new FakeOAuthGrantService(),
    IOAuthStore:
      overrides.store ??
      new FakeOAuthStore({ id: 'profile-1', email: OWNER.email }),
  };
}

// ---------------------------------------------------------------------------
// Tests -- static-token path (rvmcp_)
// ---------------------------------------------------------------------------

describe('McpAuthGuard -- static-token path', () => {
  it('authenticates a valid rvmcp_ bearer token', async () => {
    const mcpStore = new FakeMcpTokenStore(ACTIVE_RECORD);
    const guard = buildGuard({
      mcpStore,
      userStore: new FakeUserStore(OWNER),
    });
    const { ctx, req } = makeContext(`Bearer ${RAW_TOKEN}`);

    const isAllowed = await guard.canActivate(ctx);

    expect(isAllowed).toBe(true);
    expect(req['user']).toEqual({
      id: OWNER.id,
      email: OWNER.email,
      name: OWNER.name,
      picture: OWNER.picture,
    });
    expect(mcpStore.lastUsedCalls).toEqual([ACTIVE_RECORD.id]);
  });

  it('rejects a revoked or unknown token hash', async () => {
    const guard = buildGuard({
      userStore: new FakeUserStore(OWNER),
    });
    const { ctx } = makeContext(`Bearer ${RAW_TOKEN}`);
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects when the token owner no longer exists', async () => {
    const guard = buildGuard({
      mcpStore: new FakeMcpTokenStore(ACTIVE_RECORD),
    });
    const { ctx } = makeContext(`Bearer ${RAW_TOKEN}`);
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('does not set WWW-Authenticate on static-token failure', async () => {
    const guard = buildGuard({
      moduleRefOverrides: jwtModuleOverrides(),
    });
    const { ctx, res } = makeContext(`Bearer ${RAW_TOKEN}`);
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    expect(res.headers['www-authenticate']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tests -- JWT path
// ---------------------------------------------------------------------------

describe('McpAuthGuard -- JWT path', () => {
  it('authenticates a valid JWT and resolves Owner', async () => {
    const grantService = new FakeOAuthGrantService();
    const guard = buildGuard({
      userStore: new FakeUserStore(OWNER),
      moduleRefOverrides: jwtModuleOverrides({ grantService }),
    });
    const { ctx, req } = makeContext('Bearer eyJhbGciOiJIUzI1NiJ9.valid-jwt');

    const isAllowed = await guard.canActivate(ctx);

    expect(isAllowed).toBe(true);
    expect(req['user']).toEqual({
      id: OWNER.id,
      email: OWNER.email,
      name: OWNER.name,
      picture: OWNER.picture,
    });
    expect(grantService.touchCalls).toEqual(['grant-1']);
  });

  it('rejects when no Authorization header (JWT path) with WWW-Authenticate', async () => {
    const guard = buildGuard({
      moduleRefOverrides: jwtModuleOverrides(),
    });
    const { ctx, res } = makeContext(undefined);
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    expect(res.headers['www-authenticate']).toBe(
      `Bearer resource_metadata="${PRM_URL}"`,
    );
  });

  it('rejects a non-rvmcp_ bearer that fails JWT validation with WWW-Authenticate', async () => {
    const guard = buildGuard({
      moduleRefOverrides: jwtModuleOverrides({
        jwtService: new FakeJwtTokenService(undefined),
      }),
    });
    const { ctx, res } = makeContext('Bearer invalid-jwt');
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    expect(res.headers['www-authenticate']).toBe(
      `Bearer resource_metadata="${PRM_URL}"`,
    );
  });

  it('rejects a JWT whose grant has been revoked', async () => {
    const guard = buildGuard({
      userStore: new FakeUserStore(OWNER),
      moduleRefOverrides: jwtModuleOverrides({
        grantService: new FakeOAuthGrantService(false),
      }),
    });
    const { ctx, res } = makeContext('Bearer eyJ.valid-jwt');
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    expect(res.headers['www-authenticate']).toBe(
      `Bearer resource_metadata="${PRM_URL}"`,
    );
  });

  it('rejects when the JWT profile has no matching app user', async () => {
    const guard = buildGuard({
      moduleRefOverrides: jwtModuleOverrides({
        store: new FakeOAuthStore({
          id: 'profile-1',
          email: 'unknown@example.com',
        }),
      }),
    });
    const { ctx, res } = makeContext('Bearer eyJ.valid-jwt');
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    expect(res.headers['www-authenticate']).toBe(
      `Bearer resource_metadata="${PRM_URL}"`,
    );
  });

  it('rejects when the JWT profile has no email', async () => {
    const guard = buildGuard({
      userStore: new FakeUserStore(OWNER),
      moduleRefOverrides: jwtModuleOverrides({
        store: new FakeOAuthStore({ id: 'profile-1' }),
      }),
    });
    const { ctx } = makeContext('Bearer eyJ.valid-jwt');
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });
});
