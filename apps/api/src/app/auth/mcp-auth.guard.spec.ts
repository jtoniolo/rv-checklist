import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import {
  McpTokenStore,
  UserStore,
  type McpTokenRecord,
  type UpsertUserInput,
  type UpsertUserResult,
  type UserRecord,
} from '@rv-checklist/api-data-access';
import { McpAuthGuard } from './mcp-auth.guard.js';
import { TokenService } from './token.service.js';

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

class FakeUserStore extends UserStore {
  private readonly record: UserRecord | undefined;
  constructor(record?: UserRecord) {
    super();
    this.record = record;
  }
  findById(id: string): Promise<UserRecord | undefined> {
    return Promise.resolve(this.record?.id === id ? this.record : undefined);
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

function makeContext(authorization?: string): {
  ctx: ExecutionContext;
  req: Record<string, unknown>;
} {
  const req: Record<string, unknown> = {
    headers: { authorization },
  };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { ctx, req };
}

describe('McpAuthGuard', () => {
  it('authenticates a valid rvmcp_ bearer token', async () => {
    const mcpStore = new FakeMcpTokenStore(ACTIVE_RECORD);
    const guard = new McpAuthGuard(
      mcpStore,
      new FakeUserStore(OWNER),
      fakeTokenService(),
    );
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

  it('rejects when the Authorization header is missing', async () => {
    const guard = new McpAuthGuard(
      new FakeMcpTokenStore(),
      new FakeUserStore(),
      fakeTokenService(),
    );
    const { ctx } = makeContext(undefined);
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a bearer token without the rvmcp_ prefix', async () => {
    const guard = new McpAuthGuard(
      new FakeMcpTokenStore(),
      new FakeUserStore(),
      fakeTokenService(),
    );
    const { ctx } = makeContext('Bearer some-jwt-token');
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a revoked or unknown token hash', async () => {
    const guard = new McpAuthGuard(
      new FakeMcpTokenStore(), // no active record
      new FakeUserStore(OWNER),
      fakeTokenService(),
    );
    const { ctx } = makeContext(`Bearer ${RAW_TOKEN}`);
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects when the token owner no longer exists', async () => {
    const guard = new McpAuthGuard(
      new FakeMcpTokenStore(ACTIVE_RECORD),
      new FakeUserStore(), // no user
      fakeTokenService(),
    );
    const { ctx } = makeContext(`Bearer ${RAW_TOKEN}`);
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });
});
