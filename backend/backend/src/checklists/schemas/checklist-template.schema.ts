import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { ChecklistItem, ChecklistItemSchema } from './checklist-item.schema';

export type ChecklistTemplateDocument = ChecklistTemplate & Document;

@Schema()
export class ChecklistTemplate {
  @Prop({ required: true })
  name: string;

  @Prop()
  description: string;

  @Prop({ type: [ChecklistItemSchema] })
  items: ChecklistItem[];

  @Prop({ default: false })
  isDefault: boolean;

  @Prop({ type: String, enum: ['maintenance', 'pre-departure', 'departure'], required: true })
  type: string;
}

export const ChecklistTemplateSchema = SchemaFactory.createForClass(ChecklistTemplate);
