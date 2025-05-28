import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChecklistsService } from './checklists.service';
import { CreateChecklistTemplateDto } from './dto/create-checklist-template.dto';
import { UpdateChecklistTemplateDto } from './dto/update-checklist-template.dto';
import { CreateChecklistInstanceDto } from './dto/create-checklist-instance.dto';
import { UpdateChecklistInstanceDto } from './dto/update-checklist-instance.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';

@Controller('checklists')
@UseGuards(JwtAuthGuard)
export class ChecklistsController {
  constructor(private readonly checklistsService: ChecklistsService) {}

  // Checklist Template Endpoints
  @Get('templates')
  async getAllTemplates(@Query('type') type?: string) {
    return this.checklistsService.findAllTemplates(type);
  }

  @Get('templates/:id')
  async getTemplateById(@Param('id') id: string) {
    return this.checklistsService.findTemplateById(id);
  }

  @Post('templates')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async createTemplate(@Body() createTemplateDto: CreateChecklistTemplateDto) {
    return this.checklistsService.createTemplate(createTemplateDto);
  }

  @Put('templates/:id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async updateTemplate(
    @Param('id') id: string,
    @Body() updateTemplateDto: UpdateChecklistTemplateDto,
  ) {
    return this.checklistsService.updateTemplate(id, updateTemplateDto);
  }

  @Delete('templates/:id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async deleteTemplate(@Param('id') id: string) {
    return this.checklistsService.deleteTemplate(id);
  }

  // Checklist Instance Endpoints
  @Get('instances')
  async getUserInstances(@CurrentUser() user, @Query('status') status?: string) {
    return this.checklistsService.findUserInstances(user._id, status);
  }

  @Get('instances/:id')
  async getInstanceById(@Param('id') id: string, @CurrentUser() user) {
    return this.checklistsService.findInstanceById(id, user._id);
  }

  @Post('instances')
  async createInstance(
    @Body() createInstanceDto: CreateChecklistInstanceDto,
    @CurrentUser() user,
  ) {
    return this.checklistsService.createInstance(createInstanceDto, user._id);
  }

  @Put('instances/:id')
  async updateInstance(
    @Param('id') id: string,
    @Body() updateInstanceDto: UpdateChecklistInstanceDto,
    @CurrentUser() user,
  ) {
    return this.checklistsService.updateInstance(id, updateInstanceDto, user._id);
  }

  @Delete('instances/:id')
  async deleteInstance(@Param('id') id: string, @CurrentUser() user) {
    return this.checklistsService.deleteInstance(id, user._id);
  }

  // Item completion endpoints
  @Put('instances/:instanceId/items/:itemIndex/complete')
  async completeItem(
    @Param('instanceId') instanceId: string,
    @Param('itemIndex') itemIndex: number,
    @Body() body: { notes?: string },
    @CurrentUser() user,
  ) {
    return this.checklistsService.completeItem(instanceId, itemIndex, body.notes, user._id);
  }

  @Put('instances/:instanceId/items/:itemIndex/uncomplete')
  async uncompleteItem(
    @Param('instanceId') instanceId: string,
    @Param('itemIndex') itemIndex: number,
    @CurrentUser() user,
  ) {
    return this.checklistsService.uncompleteItem(instanceId, itemIndex, user._id);
  }

  @Get('default-templates')
  async getDefaultTemplates(@Query('type') type?: string) {
    return this.checklistsService.findDefaultTemplates(type);
  }
}
