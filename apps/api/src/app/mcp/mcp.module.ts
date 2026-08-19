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
import { TripsModule } from '../trips/trips.module.js';
import { McpToolsController } from './mcp-tools.controller.js';

const mcpTransport = new StreamableHttpTransport();

export const mcpStrategy = new McpStrategy({
  name: 'rv-checklist',
  version: '0.3.0',
  transports: [mcpTransport],
});

@Controller('mcp')
@UseGuards(McpAuthGuard)
class McpHttpController extends McpHttpControllerFor(mcpTransport) {}

/**
 * MCP server module (ADR-0021). Exposes twenty-three tools — ten read,
 * thirteen write (ADR-0023, amended by ADR-0027) — on a single stateless
 * endpoint, guarded by the MCP bearer-token guard (ADR-0022). The
 * {@link McpHttpController} handles HTTP routing and auth; the
 * {@link McpToolsController} defines the tools as message-pattern handlers.
 */
@Module({
  imports: [
    AuthModule,
    RigModule,
    ChecklistModule,
    RunModule,
    MaintenanceModule,
    TripsModule,
  ],
  controllers: [McpHttpController, McpToolsController],
  providers: [{ provide: MCP_STRATEGY, useValue: mcpStrategy }],
})
export class McpModule {}
