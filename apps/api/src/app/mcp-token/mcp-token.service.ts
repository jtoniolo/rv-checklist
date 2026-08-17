import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  McpTokenStore,
  type McpTokenRecord,
} from '@rv-checklist/api-data-access';

@Injectable()
export class McpTokenService {
  constructor(private readonly store: McpTokenStore) {}

  async generate(userId: string): Promise<string> {
    const raw = 'rvmcp_' + randomBytes(32).toString('base64url');
    const hash = createHash('sha256').update(raw).digest('hex');
    await this.store.replaceForUser(userId, hash);
    return raw;
  }

  status(userId: string): Promise<McpTokenRecord | undefined> {
    return this.store.findActiveByUser(userId);
  }

  revoke(userId: string): Promise<void> {
    return this.store.revokeForUser(userId);
  }
}
