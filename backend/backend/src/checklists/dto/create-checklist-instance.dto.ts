import { IsNotEmpty, IsOptional, IsString, IsMongoId } from 'class-validator';

export class CreateChecklistInstanceDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsMongoId()
  @IsNotEmpty()
  templateId: string;
}
