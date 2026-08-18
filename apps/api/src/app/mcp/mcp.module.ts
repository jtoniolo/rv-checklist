import { Controller, Module, UseGuards } from '@nestjs/common';
import {
  McpHttpControllerFor,
  McpStrategy,
  MCP_STRATEGY,
  StreamableHttpTransport,
} from '@rekog/mcp-nest';
import { AuthModule } from '../auth/auth.module.js';
import { McpAuthGuard } from '../auth/mcp-auth.guard.js';
import { ChecklistModule } from '../checklist/checklist.module.js';
import { MaintenanceModule } from '../maintenance/maintenance.module.js';
import { RigModule } from '../rig/rig.module.js';
import { RunModule } from '../run/run.module.js';
import { McpToolsController } from './mcp-tools.controller.js';

const mcpTransport = new StreamableHttpTransport();

export const mcpStrategy = new McpStrategy({
  name: 'rv-checklist',
  version: '0.2.4',
  transports: [mcpTransport],
});

@Controller('mcp')
@UseGuards(McpAuthGuard)
class McpHttpController extends McpHttpControllerFor(mcpTransport) {}

/**
 * MCP server module (ADR-0021). Exposes fifteen tools — nine read, six write
 * (ADR-0023) — on a single stateless endpoint, guarded by the MCP bearer-token
 * guard (ADR-0022). The {@link McpHttpController} handles HTTP routing and auth;
 * the {@link McpToolsController} defines the tools as message-pattern handlers.
 */
@Module({
  imports: [
    AuthModule,
    RigModule,
    ChecklistModule,
    RunModule,
    MaintenanceModule,
  ],
  controllers: [McpHttpController, McpToolsController],
  providers: [{ provide: MCP_STRATEGY, useValue: mcpStrategy }],
})
export class McpModule {}
