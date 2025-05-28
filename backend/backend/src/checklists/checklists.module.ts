import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChecklistTemplate, ChecklistTemplateSchema } from './schemas/checklist-template.schema';
import { ChecklistInstance, ChecklistInstanceSchema } from './schemas/checklist-instance.schema';
import { ChecklistItem, ChecklistItemSchema } from './schemas/checklist-item.schema';
import { ChecklistTemplatesController } from './checklist-templates.controller';
import { ChecklistInstancesController } from './checklist-instances.controller';
import { ChecklistsService } from './checklists.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ChecklistTemplate.name, schema: ChecklistTemplateSchema },
      { name: ChecklistInstance.name, schema: ChecklistInstanceSchema },
      { name: ChecklistItem.name, schema: ChecklistItemSchema },
    ]),
  ],
  controllers: [ChecklistTemplatesController, ChecklistInstancesController],
  providers: [ChecklistsService],
  exports: [ChecklistsService],
})
export class ChecklistsModule {}
