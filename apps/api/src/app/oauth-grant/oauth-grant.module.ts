import { Module } from '@nestjs/common';
import { OAuthGrantService } from '../mcp-auth/oauth-grant.service.js';
import { OAuthGrantController } from './oauth-grant.controller.js';

@Module({
  controllers: [OAuthGrantController],
  providers: [OAuthGrantService],
})
export class OAuthGrantModule {}
