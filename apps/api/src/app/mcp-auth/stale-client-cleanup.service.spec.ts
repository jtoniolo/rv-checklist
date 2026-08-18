import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { StaleClientCleanupService } from './stale-client-cleanup.service';

describe('StaleClientCleanupService', () => {
  let service: StaleClientCleanupService;
  let query: jest.Mock;

  beforeAll(async () => {
    query = jest.fn();
    const mod = await Test.createTestingModule({
      providers: [
        StaleClientCleanupService,
        { provide: DataSource, useValue: { query } },
      ],
    }).compile();
    service = mod.get(StaleClientCleanupService);
  });

  it('runs a DELETE query with a 30-day threshold', async () => {
    query.mockResolvedValue([[], 3]);
    const deleted = await service.deleteStaleClients();

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] as [string, number[]];
    expect(sql).toContain('DELETE FROM rekog_mcp_auth_clients');
    expect(sql).toContain('rekog_mcp_auth_authorization_codes');
    expect(sql).toContain('rekog_mcp_auth_sessions');
    expect(params).toEqual([30]);
    expect(deleted).toBe(3);
  });

  it('returns 0 when no rows are deleted', async () => {
    query.mockResolvedValue([[], 0]);
    expect(await service.deleteStaleClients()).toBe(0);
  });
});
