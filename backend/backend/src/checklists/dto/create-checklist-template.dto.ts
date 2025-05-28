import { IsString, IsNotEmpty, IsArray, ValidateNested, IsOptional, IsBoolean, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

class ChecklistItemDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  completed?: boolean;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreateChecklistTemplateDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChecklistItemDto)
  items: ChecklistItemDto[];

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @IsEnum(['maintenance', 'pre-departure', 'departure'])
  @IsNotEmpty()
  type: string;
}
