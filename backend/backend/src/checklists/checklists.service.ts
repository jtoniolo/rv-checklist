import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ChecklistTemplate, ChecklistTemplateDocument } from './schemas/checklist-template.schema';
import { ChecklistInstance, ChecklistInstanceDocument } from './schemas/checklist-instance.schema';
import { ChecklistItem } from './schemas/checklist-item.schema';
import { CreateChecklistTemplateDto } from './dto/create-checklist-template.dto';
import { UpdateChecklistTemplateDto } from './dto/update-checklist-template.dto';
import { CreateChecklistInstanceDto } from './dto/create-checklist-instance.dto';
import { UpdateChecklistInstanceDto } from './dto/update-checklist-instance.dto';

@Injectable()
export class ChecklistsService {
  constructor(
    @InjectModel(ChecklistTemplate.name) private checklistTemplateModel: Model<ChecklistTemplateDocument>,
    @InjectModel(ChecklistInstance.name) private checklistInstanceModel: Model<ChecklistInstanceDocument>,
  ) {}

  // Checklist Template Methods
  async findAllTemplates(type?: string): Promise<ChecklistTemplate[]> {
    const query = type ? { type } : {};
    return this.checklistTemplateModel.find(query).exec();
  }

  async findTemplateById(id: string): Promise<ChecklistTemplate> {
    const template = await this.checklistTemplateModel.findById(id).exec();
    if (!template) {
      throw new NotFoundException(`Checklist template with ID ${id} not found`);
    }
    return template;
  }

  async createTemplate(createTemplateDto: CreateChecklistTemplateDto): Promise<ChecklistTemplate> {
    return await this.checklistTemplateModel.create(createTemplateDto);
  }

  async updateTemplate(
    id: string,
    updateTemplateDto: UpdateChecklistTemplateDto,
  ): Promise<ChecklistTemplate> {
    const updatedTemplate = await this.checklistTemplateModel
      .findByIdAndUpdate(id, updateTemplateDto, { new: true })
      .exec();
    
    if (!updatedTemplate) {
      throw new NotFoundException(`Checklist template with ID ${id} not found`);
    }
    
    return updatedTemplate;
  }

  async deleteTemplate(id: string): Promise<void> {
    const result = await this.checklistTemplateModel.deleteOne({ _id: id }).exec();
    
    if (result.deletedCount === 0) {
      throw new NotFoundException(`Checklist template with ID ${id} not found`);
    }
  }

  // Checklist Instance Methods
  async findUserInstances(userId: string, status?: string): Promise<ChecklistInstance[]> {
    const query: any = { userId: new Types.ObjectId(userId) };
    
    if (status) {
      query.status = status;
    }
    
    return this.checklistInstanceModel.find(query).sort({ updatedAt: -1 }).exec();
  }

  async findInstanceById(id: string, userId: string): Promise<ChecklistInstance> {
    const instance = await this.checklistInstanceModel.findById(id).exec();
    
    if (!instance) {
      throw new NotFoundException(`Checklist instance with ID ${id} not found`);
    }
    
    if (instance.userId.toString() !== userId) {
      throw new ForbiddenException('You do not have permission to access this checklist');
    }
    
    return instance;
  }

  async createInstance(
    createInstanceDto: CreateChecklistInstanceDto,
    userId: string,
  ): Promise<ChecklistInstance> {
    if (createInstanceDto.templateId) {
      const template = await this.findTemplateById(createInstanceDto.templateId);
      
      const newInstance = {
        name: createInstanceDto.name || template.name,
        description: createInstanceDto.description || template.description,
        items: template.items.map(item => ({
          item: item,
          completedAt: null,
          notes: '',
        })),
        templateId: new Types.ObjectId(createInstanceDto.templateId),
        userId: new Types.ObjectId(userId),
        startedAt: new Date(),
      };
      
      return await this.checklistInstanceModel.create(newInstance);
    } else {
      // Create an empty checklist
      const newInstance = {
        name: createInstanceDto.name,
        description: createInstanceDto.description,
        items: [],
        userId: new Types.ObjectId(userId),
        startedAt: new Date(),
      };
      
      return await this.checklistInstanceModel.create(newInstance);
    }
  }

  async updateInstance(
    id: string,
    updateInstanceDto: UpdateChecklistInstanceDto,
    userId: string,
  ): Promise<ChecklistInstance> {
    const instance = await this.findInstanceById(id, userId);
    
    // Create update object
    const updateData: any = {};
    
    // Update basic fields
    if (updateInstanceDto.name) updateData.name = updateInstanceDto.name;
    if (updateInstanceDto.description) updateData.description = updateInstanceDto.description;
    
    // Check if the checklist is being marked as completed
    if (updateInstanceDto.status === 'completed' && instance.status !== 'completed') {
      // Check if all items are completed
      const allItemsCompleted = instance.items.every(item => item.completedAt);
      
      if (!allItemsCompleted) {
        throw new BadRequestException('Cannot mark checklist as completed when items are still pending');
      }
      
      updateData.completedAt = new Date();
    }
    
    if (updateInstanceDto.status) {
      updateData.status = updateInstanceDto.status;
    }
    
    const updatedInstance = await this.checklistInstanceModel.findByIdAndUpdate(
      id, 
      updateData, 
      { new: true }
    ).exec();

    if (!updatedInstance) {
      throw new NotFoundException(`Checklist instance with ID ${id} not found`);
    }
    
    return updatedInstance;
  }

  async deleteInstance(id: string, userId: string): Promise<void> {
    // First verify the user has access to this instance
    await this.findInstanceById(id, userId);
    await this.checklistInstanceModel.deleteOne({ _id: id }).exec();
  }

  // Item completion methods
  async completeItem(
    instanceId: string,
    itemIndex: number,
    notes: string = '',
    userId: string,
  ): Promise<ChecklistInstance> {
    const instance = await this.findInstanceById(instanceId, userId);
    
    if (itemIndex < 0 || itemIndex >= instance.items.length) {
      throw new BadRequestException('Invalid item index');
    }
    
    const updatedItems = [...instance.items];
    updatedItems[itemIndex] = {
      ...updatedItems[itemIndex],
      completedAt: new Date(),
      notes: notes || updatedItems[itemIndex].notes,
    };
    
    const updatedInstance = await this.checklistInstanceModel.findByIdAndUpdate(
      instanceId,
      { items: updatedItems },
      { new: true }
    ).exec();
    
    if (!updatedInstance) {
      throw new NotFoundException(`Checklist instance with ID ${instanceId} not found`);
    }
    
    return updatedInstance;
  }

  async uncompleteItem(
    instanceId: string,
    itemIndex: number,
    userId: string,
  ): Promise<ChecklistInstance> {
    const instance = await this.findInstanceById(instanceId, userId);
    
    if (itemIndex < 0 || itemIndex >= instance.items.length) {
      throw new BadRequestException('Invalid item index');
    }
    
    const updatedItems = [...instance.items];
    updatedItems[itemIndex] = {
      ...updatedItems[itemIndex],
      completedAt: null,
    };
    
    const updatedInstance = await this.checklistInstanceModel.findByIdAndUpdate(
      instanceId,
      { items: updatedItems },
      { new: true }
    ).exec();
    
    if (!updatedInstance) {
      throw new NotFoundException(`Checklist instance with ID ${instanceId} not found`);
    }
    
    return updatedInstance;
  }

  async findDefaultTemplates(type?: string): Promise<ChecklistTemplate[]> {
    const query: any = { isDefault: true };
    
    if (type) {
      query.type = type;
    }
    
    return this.checklistTemplateModel.find(query).exec();
  }
}
