import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  McpTokenEntity,
  McpTokenStore,
  TypeOrmMcpTokenStore,
} from '@rv-checklist/api-data-access';
import { McpTokenController } from './mcp-token.controller.js';
import { McpTokenService } from './mcp-token.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([McpTokenEntity])],
  controllers: [McpTokenController],
  providers: [
    McpTokenService,
    { provide: McpTokenStore, useClass: TypeOrmMcpTokenStore },
  ],
})
export class McpTokenModule {}
