import { type ExecutionContext, type INestApplication } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { Owner, WebSession } from '@rv-checklist/domain';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AuthService } from '../auth/auth.service.js';
import { JwtAuthGuard } from '../auth/guards.js';
import { SessionController } from './session.controller.js';

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

const SESSION_ID = '770e8400-e29b-41d4-a716-446655440010';
const SESSION_2_ID = '770e8400-e29b-41d4-a716-446655440011';

interface FakeSession {
  sessionId: string;
  userAgent: string | undefined;
  createdAt: Date;
  lastUsedAt: Date | undefined;
  ownerId: string;
  revoked: boolean;
}

class FakeAuthService {
  private readonly sessions: FakeSession[] = [
    {
      sessionId: SESSION_ID,
      userAgent: 'Mozilla/5.0 Chrome/120',
      createdAt: new Date('2025-07-01T00:00:00.000Z'),
      lastUsedAt: new Date('2025-07-15T12:00:00.000Z'),
      ownerId: owner.id,
      revoked: false,
    },
    {
      sessionId: SESSION_2_ID,
      userAgent: 'Mozilla/5.0 Firefox/115',
      createdAt: new Date('2025-07-02T00:00:00.000Z'),
      lastUsedAt: undefined,
      ownerId: owner.id,
      revoked: false,
    },
  ];

  listSessions(userId: string) {
    const list = this.sessions.filter(
      (s) => s.ownerId === userId && !s.revoked,
    );
    return Promise.resolve(
      list.map(({ sessionId, userAgent, createdAt, lastUsedAt }) => ({
        sessionId,
        userAgent,
        createdAt,
        lastUsedAt,
      })),
    );
  }

  revokeSession(sessionId: string, userId: string): Promise<boolean> {
    const session = this.sessions.find(
      (s) => s.sessionId === sessionId && s.ownerId === userId && !s.revoked,
    );
    if (!session) return Promise.resolve(false);
    session.revoked = true;
    return Promise.resolve(true);
  }
}

function buildModule(activeOwner: Owner) {
  return Test.createTestingModule({
    controllers: [SessionController],
    providers: [
      { provide: AuthService, useClass: FakeAuthService },
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

describe('Session HTTP integration (#98)', () => {
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

  describe('GET /sessions', () => {
    it('returns the owner sessions as a JSON array', async () => {
      const res = await request(server).get('/sessions').expect(200);
      const body = res.body as WebSession[];
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(2);
      expect(body[0]).toEqual(
        expect.objectContaining({
          sessionId: SESSION_ID,
          userAgent: 'Mozilla/5.0 Chrome/120',
        }),
      );
    });
  });

  describe('DELETE /sessions/:sessionId', () => {
    it('revokes an owned session and returns 204', async () => {
      await request(server).delete(`/sessions/${SESSION_ID}`).expect(204);
    });

    it('returns 404 for an already-revoked session', async () => {
      await request(server).delete(`/sessions/${SESSION_ID}`).expect(404);
    });

    it('returns 404 for a non-existent session', async () => {
      await request(server)
        .delete('/sessions/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });

    it('rejects an invalid UUID', async () => {
      await request(server).delete('/sessions/not-a-uuid').expect(400);
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
      const res = await request(otherServer).get('/sessions').expect(200);
      expect(res.body).toEqual([]);
    });

    it('cannot revoke another owner session', async () => {
      await request(otherServer)
        .delete(`/sessions/${SESSION_2_ID}`)
        .expect(404);
    });
  });
});
