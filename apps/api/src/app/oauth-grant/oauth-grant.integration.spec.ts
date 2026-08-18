import { type ExecutionContext, type INestApplication } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { Owner } from '@rv-checklist/domain';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';
import type { App } from 'supertest/types';
import { JwtAuthGuard } from '../auth/guards.js';
import {
  OAuthGrantService,
  type ActiveGrantRow,
} from '../mcp-auth/oauth-grant.service.js';
import { OAuthGrantController } from './oauth-grant.controller.js';

const owner: Owner = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  email: 'owner@example.com',
  name: 'Test Owner',
  picture: undefined,
};

const otherOwner: Owner = {
  id: '550e8400-e29b-41d4-a716-446655440002',
  email: 'other@example.com',
  name: undefined,
  picture: undefined,
};

const GRANT_ID = '660e8400-e29b-41d4-a716-446655440010';
const GRANT_2_ID = '660e8400-e29b-41d4-a716-446655440011';

interface GrantResponse {
  id: string;
  clientName: string;
  createdAt: string;
  lastUsedAt: string | undefined;
}

class FakeOAuthGrantService {
  private readonly grants: (ActiveGrantRow & {
    email: string;
    revoked: boolean;
  })[] = [
    {
      id: GRANT_ID,
      clientName: 'Claude Desktop',
      createdAt: '2025-07-01T00:00:00.000Z',
      lastUsedAt: '2025-07-15T12:00:00.000Z',
      email: owner.email,
      revoked: false,
    },
    {
      id: GRANT_2_ID,
      clientName: 'Cursor',
      createdAt: '2025-07-02T00:00:00.000Z',
      // eslint-disable-next-line unicorn/no-null -- DB column is nullable
      lastUsedAt: null,
      email: owner.email,
      revoked: false,
    },
  ];

  listActiveByUser(email: string): ActiveGrantRow[] {
    return this.grants
      .filter((g) => g.email === email && !g.revoked)
      .map(({ id, clientName, createdAt, lastUsedAt }) => ({
        id,
        clientName,
        createdAt,
        lastUsedAt,
      }));
  }

  revokeGrantForUser(grantId: string, email: string): boolean {
    const grant = this.grants.find(
      (g) => g.id === grantId && g.email === email && !g.revoked,
    );
    if (!grant) return false;
    grant.revoked = true;
    return true;
  }
}

function buildModule(activeOwner: Owner) {
  return Test.createTestingModule({
    controllers: [OAuthGrantController],
    providers: [
      { provide: OAuthGrantService, useClass: FakeOAuthGrantService },
      { provide: APP_PIPE, useClass: ZodValidationPipe },
      { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
    ],
  })
    .overrideGuard(JwtAuthGuard)
    .useValue({
      canActivate: (ctx: ExecutionContext) => {
        ctx.switchToHttp().getRequest<{ user: Owner }>().user = activeOwner;
        return true;
      },
    })
    .compile();
}

describe('OAuthGrant HTTP integration (#97)', () => {
  let app: INestApplication;
  let server: App;

  beforeAll(async () => {
    const module = await buildModule(owner);
    app = module.createNestApplication();
    await app.init();
    server = app.getHttpServer() as App;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /oauth-grants', () => {
    it('returns the owner grants as a JSON array', async () => {
      const res = await request(server).get('/oauth-grants').expect(200);
      const body = res.body as GrantResponse[];
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(2);
      expect(body[0]).toEqual(
        expect.objectContaining({
          id: GRANT_ID,
          clientName: 'Claude Desktop',
        }),
      );
    });
  });

  describe('DELETE /oauth-grants/:id', () => {
    it('revokes an owned grant and returns 204', async () => {
      await request(server).delete(`/oauth-grants/${GRANT_ID}`).expect(204);
    });

    it('returns 404 for an already-revoked grant', async () => {
      await request(server).delete(`/oauth-grants/${GRANT_ID}`).expect(404);
    });

    it('returns 404 for a non-existent grant', async () => {
      await request(server)
        .delete('/oauth-grants/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });

    it('rejects an invalid UUID', async () => {
      await request(server).delete('/oauth-grants/not-a-uuid').expect(400);
    });
  });

  describe('ownership isolation', () => {
    let otherApp: INestApplication;
    let otherServer: App;

    beforeAll(async () => {
      const module = await buildModule(otherOwner);
      otherApp = module.createNestApplication();
      await otherApp.init();
      otherServer = otherApp.getHttpServer() as App;
    });

    afterAll(async () => {
      await otherApp.close();
    });

    it('returns empty list for a different owner', async () => {
      const res = await request(otherServer).get('/oauth-grants').expect(200);
      expect(res.body).toEqual([]);
    });

    it('cannot revoke another owner grant', async () => {
      await request(otherServer)
        .delete(`/oauth-grants/${GRANT_2_ID}`)
        .expect(404);
    });
  });
});
