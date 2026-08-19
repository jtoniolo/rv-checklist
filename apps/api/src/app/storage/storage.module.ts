import { Module } from '@nestjs/common';
import { ObjectStorage, S3ObjectStorage } from './object-storage.js';

/**
 * Object-storage feature module (ADR-0026): binds the {@link ObjectStorage}
 * seam to the Garage-backed S3 implementation and exports it for the features
 * that keep files — attachments today, photo fields (ADR-0007) later. One
 * bucket for the whole app, so one binding.
 */
@Module({
  providers: [{ provide: ObjectStorage, useClass: S3ObjectStorage }],
  exports: [ObjectStorage],
})
export class StorageModule {}
