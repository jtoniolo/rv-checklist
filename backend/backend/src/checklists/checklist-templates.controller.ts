import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChecklistsService } from './checklists.service';
import { CreateChecklistTemplateDto } from './dto/create-checklist-template.dto';
import { UpdateChecklistTemplateDto } from './dto/update-checklist-template.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';

@Controller('checklist-templates')
@UseGuards(JwtAuthGuard)
export class ChecklistTemplatesController {
  constructor(private readonly checklistsService: ChecklistsService) {}

  @Get()
  async getAllTemplates(@Query('type') type?: string) {
    return this.checklistsService.findAllTemplates(type);
  }

  @Get('default')
  async getDefaultTemplates(@Query('type') type?: string) {
    return this.checklistsService.findDefaultTemplates(type);
  }

  @Get(':id')
  async getTemplateById(@Param('id') id: string) {
    return this.checklistsService.findTemplateById(id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin')
  async createTemplate(@Body() createTemplateDto: CreateChecklistTemplateDto) {
    return this.checklistsService.createTemplate(createTemplateDto);
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async updateTemplate(
    @Param('id') id: string,
    @Body() updateTemplateDto: UpdateChecklistTemplateDto,
  ) {
    return this.checklistsService.updateTemplate(id, updateTemplateDto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async deleteTemplate(@Param('id') id: string) {
    return this.checklistsService.deleteTemplate(id);
  }
}
