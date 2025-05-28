import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ChecklistsService } from './checklists.service';
import { ChecklistTemplate, ChecklistTemplateDocument } from './schemas/checklist-template.schema';
import { ChecklistInstance, ChecklistInstanceDocument } from './schemas/checklist-instance.schema';

describe('ChecklistsService', () => {
  let checklistsService: ChecklistsService;
  let templateModel: Model<ChecklistTemplateDocument>;
  let instanceModel: Model<ChecklistInstanceDocument>;

  const mockTemplateModel = {
    find: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    create: jest.fn(),
    deleteOne: jest.fn(),
  };

  const mockInstanceModel = {
    find: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    sort: jest.fn(),
    create: jest.fn(),
    deleteOne: jest.fn(),
  };

  const mockTemplateId = new Types.ObjectId();
  const mockUserId = new Types.ObjectId();
  const mockInstanceId = new Types.ObjectId();

  const mockTemplate = {
    _id: mockTemplateId,
    name: 'Test Template',
    description: 'Template description',
    items: [
      {
        title: 'Item 1',
        description: 'Description 1',
        completed: false,
      },
      {
        title: 'Item 2',
        description: 'Description 2',
        completed: false,
      },
    ],
    type: 'maintenance',
    isDefault: true,
  };

  const mockInstance = {
    _id: mockInstanceId,
    name: 'Test Instance',
    description: 'Instance description',
    items: [
      {
        item: {
          title: 'Item 1',
          description: 'Description 1',
          completed: false,
        },
        completedAt: null,
        notes: '',
      },
      {
        item: {
          title: 'Item 2',
          description: 'Description 2',
          completed: false,
        },
        completedAt: null,
        notes: '',
      },
    ],
    templateId: mockTemplateId,
    userId: mockUserId,
    status: 'in-progress',
    startedAt: new Date(),
    completedAt: null,
    save: jest.fn(),
    deleteOne: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChecklistsService,
        {
          provide: getModelToken(ChecklistTemplate.name),
          useValue: mockTemplateModel,
        },
        {
          provide: getModelToken(ChecklistInstance.name),
          useValue: mockInstanceModel,
        },
      ],
    }).compile();

    checklistsService = module.get<ChecklistsService>(ChecklistsService);
    templateModel = module.get<Model<ChecklistTemplateDocument>>(getModelToken(ChecklistTemplate.name));
    instanceModel = module.get<Model<ChecklistInstanceDocument>>(getModelToken(ChecklistInstance.name));
  });

  it('should be defined', () => {
    expect(checklistsService).toBeDefined();
  });

  describe('findAllTemplates', () => {
    it('should return all templates if no type is provided', async () => {
      mockTemplateModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([mockTemplate]),
      });

      const result = await checklistsService.findAllTemplates();

      expect(mockTemplateModel.find).toHaveBeenCalledWith({});
      expect(result).toEqual([mockTemplate]);
    });

    it('should return templates filtered by type if provided', async () => {
      mockTemplateModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([mockTemplate]),
      });

      const result = await checklistsService.findAllTemplates('maintenance');

      expect(mockTemplateModel.find).toHaveBeenCalledWith({ type: 'maintenance' });
      expect(result).toEqual([mockTemplate]);
    });
  });

  describe('findTemplateById', () => {
    it('should return a template if found', async () => {
      mockTemplateModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockTemplate),
      });

      const result = await checklistsService.findTemplateById(mockTemplateId.toString());

      expect(mockTemplateModel.findById).toHaveBeenCalledWith(mockTemplateId.toString());
      expect(result).toEqual(mockTemplate);
    });

    it('should throw NotFoundException if template not found', async () => {
      mockTemplateModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(checklistsService.findTemplateById(mockTemplateId.toString())).rejects.toThrow(NotFoundException);
    });
  });

  describe('createTemplate', () => {
    it('should create and return a new template', async () => {
      const createTemplateDto = {
        name: 'New Template',
        description: 'New template description',
        items: [
          {
            title: 'New Item',
            description: 'New item description',
            completed: false,
          },
        ],
        type: 'maintenance',
        isDefault: false,
      };

      mockTemplateModel.create.mockResolvedValue({
        ...createTemplateDto,
        _id: new Types.ObjectId(),
      });

      const result = await checklistsService.createTemplate(createTemplateDto);

      expect(result).toHaveProperty('name', createTemplateDto.name);
      expect(result).toHaveProperty('description', createTemplateDto.description);
    });
  });

  describe('findUserInstances', () => {
    it('should return user instances', async () => {
      const mockSort = {
        exec: jest.fn().mockResolvedValue([mockInstance]),
      };
      mockInstanceModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue(mockSort),
      });

      const result = await checklistsService.findUserInstances(mockUserId.toString());

      expect(mockInstanceModel.find).toHaveBeenCalledWith({
        userId: expect.any(Types.ObjectId),
      });
      expect(result).toEqual([mockInstance]);
    });
  });

  describe('findInstanceById', () => {
    it('should return an instance if found and owned by the user', async () => {
      mockInstanceModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          ...mockInstance,
          userId: {
            toString: jest.fn().mockReturnValue(mockUserId.toString()),
          },
        }),
      });

      const result = await checklistsService.findInstanceById(
        mockInstanceId.toString(), 
        mockUserId.toString()
      );

      expect(mockInstanceModel.findById).toHaveBeenCalledWith(mockInstanceId.toString());
      expect(result).toBeDefined();
    });

    it('should throw NotFoundException if instance not found', async () => {
      mockInstanceModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        checklistsService.findInstanceById(mockInstanceId.toString(), mockUserId.toString())
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user does not own the instance', async () => {
      mockInstanceModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          ...mockInstance,
          userId: {
            toString: jest.fn().mockReturnValue('different-user-id'),
          },
        }),
      });

      await expect(
        checklistsService.findInstanceById(mockInstanceId.toString(), mockUserId.toString())
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('completeItem', () => {
    it('should mark an item as completed', async () => {
      const itemIndex = 0;
      const notes = 'Test notes';
      const mockInstanceWithMethods = {
        ...mockInstance,
        userId: {
          toString: jest.fn().mockReturnValue(mockUserId.toString()),
        }
      };

      // First mock the findById call
      mockInstanceModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockInstanceWithMethods),
      });

      // Mock the findByIdAndUpdate call with chainable exec()
      const updatedInstance = {
        ...mockInstance,
        items: [
          {
            ...mockInstance.items[0],
            completedAt: new Date(),
            notes,
          },
          mockInstance.items[1],
        ]
      };
      mockInstanceModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(updatedInstance),
      });

      const result = await checklistsService.completeItem(
        mockInstanceId.toString(),
        itemIndex,
        notes,
        mockUserId.toString()
      );

      expect(mockInstanceModel.findByIdAndUpdate).toHaveBeenCalledWith(
        mockInstanceId.toString(),
        { items: expect.any(Array) },
        { new: true }
      );
    });

    it('should throw BadRequestException if item index is invalid', async () => {
      const mockInstanceWithMethods = {
        ...mockInstance,
        userId: {
          toString: jest.fn().mockReturnValue(mockUserId.toString()),
        },
      };

      mockInstanceModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockInstanceWithMethods),
      });

      await expect(
        checklistsService.completeItem(
          mockInstanceId.toString(),
          999,
          '',
          mockUserId.toString()
        )
      ).rejects.toThrow(BadRequestException);
    });
  });
});
