import { PartialType } from '@nestjs/mapped-types';
import { CreateChecklistInstanceDto } from './create-checklist-instance.dto';
import { IsArray, IsEnum, IsOptional } from 'class-validator';

export class UpdateChecklistInstanceDto extends PartialType(CreateChecklistInstanceDto) {
  @IsArray()
  @IsOptional()
  items?: Array<{
    item: any;
    completedAt: Date | null;
    notes: string | null;
  }>;

  @IsEnum(['in-progress', 'completed'])
  @IsOptional()
  status?: string;
}
