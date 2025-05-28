import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChecklistsService } from './checklists.service';
import { CreateChecklistInstanceDto } from './dto/create-checklist-instance.dto';
import { UpdateChecklistInstanceDto } from './dto/update-checklist-instance.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('checklist-instances')
@UseGuards(JwtAuthGuard)
export class ChecklistInstancesController {
  constructor(private readonly checklistsService: ChecklistsService) {}

  @Get()
  async getUserInstances(@CurrentUser() user, @Query('status') status?: string) {
    return this.checklistsService.findUserInstances(user._id, status);
  }

  @Get(':id')
  async getInstanceById(@Param('id') id: string, @CurrentUser() user) {
    return this.checklistsService.findInstanceById(id, user._id);
  }

  @Post()
  async createInstance(
    @Body() createInstanceDto: CreateChecklistInstanceDto,
    @CurrentUser() user,
  ) {
    return this.checklistsService.createInstance(createInstanceDto, user._id);
  }

  @Put(':id')
  async updateInstance(
    @Param('id') id: string,
    @Body() updateInstanceDto: UpdateChecklistInstanceDto,
    @CurrentUser() user,
  ) {
    return this.checklistsService.updateInstance(id, updateInstanceDto, user._id);
  }

  @Delete(':id')
  async deleteInstance(@Param('id') id: string, @CurrentUser() user) {
    return this.checklistsService.deleteInstance(id, user._id);
  }

  @Put(':instanceId/items/:itemIndex/complete')
  async completeItem(
    @Param('instanceId') instanceId: string,
    @Param('itemIndex') itemIndex: number,
    @Body() body: { notes?: string },
    @CurrentUser() user,
  ) {
    return this.checklistsService.completeItem(instanceId, itemIndex, body.notes, user._id);
  }

  @Put(':instanceId/items/:itemIndex/uncomplete')
  async uncompleteItem(
    @Param('instanceId') instanceId: string,
    @Param('itemIndex') itemIndex: number,
    @CurrentUser() user,
  ) {
    return this.checklistsService.uncompleteItem(instanceId, itemIndex, user._id);
  }
}
