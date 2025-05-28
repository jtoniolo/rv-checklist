import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { ConflictException } from '@nestjs/common';
import { UsersService } from './users.service';
import { User, UserDocument } from './schemas/user.schema';

// Mock bcrypt
jest.mock('bcrypt');

describe('UsersService', () => {
  let usersService: UsersService;
  let userModel: Model<UserDocument>;

  const mockUserModel = {
    findOne: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  };

  const mockUser = {
    _id: 'test-user-id',
    email: 'test@example.com',
    passwordHash: 'hashed-password',
    firstName: 'Test',
    lastName: 'User',
    role: 'user',
    isActive: true,
    save: jest.fn(),
    exec: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getModelToken(User.name),
          useValue: mockUserModel,
        },
      ],
    }).compile();

    usersService = module.get<UsersService>(UsersService);
    userModel = module.get<Model<UserDocument>>(getModelToken(User.name));
  });

  it('should be defined', () => {
    expect(usersService).toBeDefined();
  });

  describe('findByEmail', () => {
    it('should return a user if found', async () => {
      mockUserModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockUser),
      });

      const result = await usersService.findByEmail('test@example.com');

      expect(mockUserModel.findOne).toHaveBeenCalledWith({ email: 'test@example.com' });
      expect(result).toEqual(mockUser);
    });

    it('should return null if user not found', async () => {
      mockUserModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const result = await usersService.findByEmail('nonexistent@example.com');

      expect(mockUserModel.findOne).toHaveBeenCalledWith({ email: 'nonexistent@example.com' });
      expect(result).toBeNull();
    });
  });

  describe('findById', () => {
    it('should return a user if found', async () => {
      mockUserModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockUser),
      });

      const result = await usersService.findById('test-user-id');

      expect(mockUserModel.findById).toHaveBeenCalledWith('test-user-id');
      expect(result).toEqual(mockUser);
    });

    it('should return null if user not found', async () => {
      mockUserModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const result = await usersService.findById('nonexistent-id');

      expect(mockUserModel.findById).toHaveBeenCalledWith('nonexistent-id');
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create and return a new user', async () => {
      const createUserDto = {
        email: 'new@example.com',
        password: 'password123',
        firstName: 'New',
        lastName: 'User',
      };

      mockUserModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');

      const newUserDoc = {
        ...createUserDto,
        _id: 'new-user-id',
        passwordHash: 'hashed-password',
      };

      mockUserModel.create.mockResolvedValue(newUserDoc);

      const result = await usersService.create(createUserDto);

      expect(mockUserModel.findOne).toHaveBeenCalledWith({ email: createUserDto.email });
      expect(bcrypt.hash).toHaveBeenCalledWith(createUserDto.password, 10);
      expect(result).toEqual({
        ...createUserDto,
        _id: 'new-user-id',
        passwordHash: 'hashed-password',
      });
    });

    it('should throw ConflictException if email already in use', async () => {
      const createUserDto = {
        email: 'existing@example.com',
        password: 'password123',
        firstName: 'Existing',
        lastName: 'User',
      };

      mockUserModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockUser),
      });

      await expect(usersService.create(createUserDto)).rejects.toThrow(ConflictException);
      expect(mockUserModel.findOne).toHaveBeenCalledWith({ email: createUserDto.email });
    });
  });

  describe('updateLastLogin', () => {
    it('should update the lastLoginAt date', async () => {
      mockUserModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockUser),
      });

      await usersService.updateLastLogin('test-user-id');

      expect(mockUserModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'test-user-id',
        { lastLoginAt: expect.any(Date) },
        { new: true },
      );
    });
  });
});
