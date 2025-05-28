import { Test, TestingModule } from '@nestjs/testing';
import { ChecklistInstancesController } from './checklist-instances.controller';
import { ChecklistsService } from './checklists.service';

describe('ChecklistInstancesController', () => {
  let controller: ChecklistInstancesController;
  let service: ChecklistsService;

  const mockUser = {
    _id: 'user-id',
    email: 'test@example.com',
  };

  const mockChecklistsService = {
    findUserInstances: jest.fn(),
    findInstanceById: jest.fn(),
    createInstance: jest.fn(),
    updateInstance: jest.fn(),
    deleteInstance: jest.fn(),
    completeItem: jest.fn(),
    uncompleteItem: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChecklistInstancesController],
      providers: [
        {
          provide: ChecklistsService,
          useValue: mockChecklistsService,
        },
      ],
    }).compile();

    controller = module.get<ChecklistInstancesController>(ChecklistInstancesController);
    service = module.get<ChecklistsService>(ChecklistsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getUserInstances', () => {
    it('should call service.findUserInstances with the right params', async () => {
      const status = 'in-progress';
      mockChecklistsService.findUserInstances.mockResolvedValue([]);
      
      await controller.getUserInstances(mockUser, status);
      
      expect(service.findUserInstances).toHaveBeenCalledWith(mockUser._id, status);
    });
  });

  describe('getInstanceById', () => {
    it('should call service.findInstanceById with the right params', async () => {
      const id = 'instance-id';
      mockChecklistsService.findInstanceById.mockResolvedValue({});
      
      await controller.getInstanceById(id, mockUser);
      
      expect(service.findInstanceById).toHaveBeenCalledWith(id, mockUser._id);
    });
  });

  describe('createInstance', () => {
    it('should call service.createInstance with the right params', async () => {
      const createDto = {
        name: 'New Instance',
        description: 'Description',
        templateId: 'template-id',
      };
      mockChecklistsService.createInstance.mockResolvedValue({});
      
      await controller.createInstance(createDto, mockUser);
      
      expect(service.createInstance).toHaveBeenCalledWith(createDto, mockUser._id);
    });
  });

  describe('updateInstance', () => {
    it('should call service.updateInstance with the right params', async () => {
      const id = 'instance-id';
      const updateDto = {
        name: 'Updated Instance',
        status: 'completed',
      };
      mockChecklistsService.updateInstance.mockResolvedValue({});
      
      await controller.updateInstance(id, updateDto, mockUser);
      
      expect(service.updateInstance).toHaveBeenCalledWith(id, updateDto, mockUser._id);
    });
  });

  describe('deleteInstance', () => {
    it('should call service.deleteInstance with the right params', async () => {
      const id = 'instance-id';
      mockChecklistsService.deleteInstance.mockResolvedValue(undefined);
      
      await controller.deleteInstance(id, mockUser);
      
      expect(service.deleteInstance).toHaveBeenCalledWith(id, mockUser._id);
    });
  });

  describe('completeItem', () => {
    it('should call service.completeItem with the right params', async () => {
      const instanceId = 'instance-id';
      const itemIndex = 0;
      const body = { notes: 'Test notes' };
      mockChecklistsService.completeItem.mockResolvedValue({});
      
      await controller.completeItem(instanceId, itemIndex, body, mockUser);
      
      expect(service.completeItem).toHaveBeenCalledWith(instanceId, itemIndex, body.notes, mockUser._id);
    });
  });

  describe('uncompleteItem', () => {
    it('should call service.uncompleteItem with the right params', async () => {
      const instanceId = 'instance-id';
      const itemIndex = 0;
      mockChecklistsService.uncompleteItem.mockResolvedValue({});
      
      await controller.uncompleteItem(instanceId, itemIndex, mockUser);
      
      expect(service.uncompleteItem).toHaveBeenCalledWith(instanceId, itemIndex, mockUser._id);
    });
  });
});
