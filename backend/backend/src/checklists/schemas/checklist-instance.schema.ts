import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { ChecklistItem, ChecklistItemSchema } from './checklist-item.schema';

export type ChecklistInstanceDocument = ChecklistInstance & Document;

@Schema({ timestamps: true })
export class ChecklistInstance {
  @Prop({ required: true })
  name: string;

  @Prop()
  description: string;

  @Prop({ type: [{ 
    item: ChecklistItemSchema,
    completedAt: { type: Date },
    notes: { type: String }
  }] })
  items: Array<{
    item: ChecklistItem;
    completedAt: Date;
    notes: string;
  }>;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'ChecklistTemplate' })
  templateId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  userId: MongooseSchema.Types.ObjectId;

  @Prop({ default: 'in-progress', enum: ['in-progress', 'completed'] })
  status: string;

  @Prop()
  completedAt: Date;

  @Prop()
  startedAt: Date;
}

export const ChecklistInstanceSchema = SchemaFactory.createForClass(ChecklistInstance);
