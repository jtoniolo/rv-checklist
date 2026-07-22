import { Module } from '@nestjs/common';
import { ChecklistModule } from '../checklist/checklist.module.js';
import { MaintenanceModule } from '../maintenance/maintenance.module.js';
import { RigModule } from '../rig/rig.module.js';
import { SeedService, StarterContentSeeder } from './seed.service.js';

/**
 * Seed module (issue #19). Provides the {@link StarterContentSeeder} seam the
 * auth flow triggers on a first sign-in, backed by {@link SeedService}. The
 * loader creates starter content through the same use-cases as user content,
 * so it imports the feature modules and borrows their exported services rather
 * than re-binding anything. No HTTP surface: seeding happens only on the
 * first-sign-in path.
 */
@Module({
  imports: [RigModule, ChecklistModule, MaintenanceModule],
  providers: [
    SeedService,
    { provide: StarterContentSeeder, useExisting: SeedService },
  ],
  exports: [StarterContentSeeder],
})
export class SeedModule {}
