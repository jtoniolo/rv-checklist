import { Test, TestingModule } from '@nestjs/testing';
import { ChecklistTemplatesController } from './checklist-templates.controller';
import { ChecklistsService } from './checklists.service';

describe('ChecklistTemplatesController', () => {
  let controller: ChecklistTemplatesController;
  let service: ChecklistsService;

  const mockChecklistsService = {
    findAllTemplates: jest.fn(),
    findDefaultTemplates: jest.fn(),
    findTemplateById: jest.fn(),
    createTemplate: jest.fn(),
    updateTemplate: jest.fn(),
    deleteTemplate: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChecklistTemplatesController],
      providers: [
        {
          provide: ChecklistsService,
          useValue: mockChecklistsService,
        },
      ],
    }).compile();

    controller = module.get<ChecklistTemplatesController>(ChecklistTemplatesController);
    service = module.get<ChecklistsService>(ChecklistsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getAllTemplates', () => {
    it('should call service.findAllTemplates with the right params', async () => {
      const type = 'maintenance';
      mockChecklistsService.findAllTemplates.mockResolvedValue([]);
      
      await controller.getAllTemplates(type);
      
      expect(service.findAllTemplates).toHaveBeenCalledWith(type);
    });
  });

  describe('getDefaultTemplates', () => {
    it('should call service.findDefaultTemplates with the right params', async () => {
      const type = 'pre-departure';
      mockChecklistsService.findDefaultTemplates.mockResolvedValue([]);
      
      await controller.getDefaultTemplates(type);
      
      expect(service.findDefaultTemplates).toHaveBeenCalledWith(type);
    });
  });

  describe('getTemplateById', () => {
    it('should call service.findTemplateById with the right params', async () => {
      const id = 'template-id';
      mockChecklistsService.findTemplateById.mockResolvedValue({});
      
      await controller.getTemplateById(id);
      
      expect(service.findTemplateById).toHaveBeenCalledWith(id);
    });
  });

  describe('createTemplate', () => {
    it('should call service.createTemplate with the right params', async () => {
      const createDto = {
        name: 'New Template',
        description: 'Description',
        items: [],
        type: 'maintenance',
        isDefault: false,
      };
      mockChecklistsService.createTemplate.mockResolvedValue({});
      
      await controller.createTemplate(createDto);
      
      expect(service.createTemplate).toHaveBeenCalledWith(createDto);
    });
  });

  describe('updateTemplate', () => {
    it('should call service.updateTemplate with the right params', async () => {
      const id = 'template-id';
      const updateDto = {
        name: 'Updated Template',
        description: 'Updated Description',
      };
      mockChecklistsService.updateTemplate.mockResolvedValue({});
      
      await controller.updateTemplate(id, updateDto);
      
      expect(service.updateTemplate).toHaveBeenCalledWith(id, updateDto);
    });
  });

  describe('deleteTemplate', () => {
    it('should call service.deleteTemplate with the right params', async () => {
      const id = 'template-id';
      mockChecklistsService.deleteTemplate.mockResolvedValue(undefined);
      
      await controller.deleteTemplate(id);
      
      expect(service.deleteTemplate).toHaveBeenCalledWith(id);
    });
  });
});
