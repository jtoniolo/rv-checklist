import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SeedService } from './seed.service';
import { SeedController } from './seed.controller';
import { ChecklistTemplate, ChecklistTemplateSchema } from '../checklists/schemas/checklist-template.schema';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ChecklistTemplate.name, schema: ChecklistTemplateSchema },
    ]),
    AuthModule,
  ],
  controllers: [SeedController],
  providers: [SeedService],
  exports: [SeedService]
})
export class SeedModule {}
