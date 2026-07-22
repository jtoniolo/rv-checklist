import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  LogEntryEntity,
  LogEntryRepository,
  MaintenanceTaskEntity,
  MaintenanceTaskRepository,
  RigEntity,
  RigRepository,
  TypeOrmLogEntryRepository,
  TypeOrmMaintenanceTaskRepository,
  TypeOrmRigRepository,
} from '@rv-checklist/api-data-access';
import { LogEntryController } from './log-entry.controller.js';
import { LogEntryService } from './log-entry.service.js';
import { MaintenanceTaskController } from './maintenance-task.controller.js';
import { MaintenanceTaskService } from './maintenance-task.service.js';

/**
 * Maintenance feature module (issue #17): tasks and their log entries travel
 * together — an entry snapshots its task's fields and is created through the
 * task, so one module owns both HTTP surfaces. Binds the task and log-entry
 * repository ports to their TypeORM implementations, plus {@link RigRepository}
 * (ownership is resolved through the rig, ADR-0006). The port bindings are the
 * seam the use-case tests swap for the in-memory doubles.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      MaintenanceTaskEntity,
      LogEntryEntity,
      RigEntity,
    ]),
  ],
  controllers: [MaintenanceTaskController, LogEntryController],
  providers: [
    MaintenanceTaskService,
    LogEntryService,
    {
      provide: MaintenanceTaskRepository,
      useClass: TypeOrmMaintenanceTaskRepository,
    },
    { provide: LogEntryRepository, useClass: TypeOrmLogEntryRepository },
    { provide: RigRepository, useClass: TypeOrmRigRepository },
  ],
  // The seed loader (issue #19) creates starter content through this use-case.
  exports: [MaintenanceTaskService],
})
export class MaintenanceModule {}
