import { WebSessionSchema } from '@rv-checklist/domain';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class WebSessionListDto extends createZodDto(
  z.array(WebSessionSchema),
) {}
