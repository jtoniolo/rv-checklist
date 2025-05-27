import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type ChecklistItemDocument = ChecklistItem & Document;

@Schema()
export class ChecklistItem {
  @Prop({ required: true })
  title: string;

  @Prop()
  description: string;

  @Prop({ default: false })
  completed: boolean;

  @Prop()
  notes: string;
}

export const ChecklistItemSchema = SchemaFactory.createForClass(ChecklistItem);
