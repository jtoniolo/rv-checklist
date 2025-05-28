import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UsersService } from './users.service';
import { UnauthorizedException } from '@nestjs/common';

// Mock bcrypt
jest.mock('bcrypt');

describe('AuthService', () => {
  let authService: AuthService;
  let usersService: UsersService;
  let jwtService: JwtService;

  const mockUser = {
    id: 'test-user-id',
    email: 'test@example.com',
    passwordHash: 'hashed-password',
    firstName: 'Test',
    lastName: 'User',
    role: 'user',
    isActive: true,
    toObject: () => ({
      id: 'test-user-id',
      email: 'test@example.com',
      passwordHash: 'hashed-password',
      firstName: 'Test',
      lastName: 'User',
      role: 'user',
      isActive: true,
    }),
  };

  const mockUsersService = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    updateLastLogin: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    usersService = module.get<UsersService>(UsersService);
    jwtService = module.get<JwtService>(JwtService);
  });

  it('should be defined', () => {
    expect(authService).toBeDefined();
  });

  describe('validateUser', () => {
    it('should return the user if found and active', async () => {
      mockUsersService.findById.mockResolvedValue(mockUser);
      
      const result = await authService.validateUser({ sub: 'test-user-id' });
      
      expect(result).toBe(mockUser);
      expect(mockUsersService.findById).toHaveBeenCalledWith('test-user-id');
    });

    it('should throw UnauthorizedException if user is not found', async () => {
      mockUsersService.findById.mockResolvedValue(null);
      
      await expect(authService.validateUser({ sub: 'test-user-id' })).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if user is not active', async () => {
      mockUsersService.findById.mockResolvedValue({
        ...mockUser,
        isActive: false,
      });
      
      await expect(authService.validateUser({ sub: 'test-user-id' })).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('register', () => {
    it('should create a new user and return access token', async () => {
      const registerDto = {
        email: 'new@example.com',
        password: 'password123',
        firstName: 'New',
        lastName: 'User',
      };
      
      const newUser = { ...mockUser, id: 'new-user-id' };
      
      mockUsersService.create.mockResolvedValue(newUser);
      mockJwtService.sign.mockReturnValue('test-token');
      
      const result = await authService.register(registerDto);
      
      expect(mockUsersService.create).toHaveBeenCalledWith(registerDto);
      expect(mockJwtService.sign).toHaveBeenCalledWith({ sub: 'new-user-id' });
      expect(result).toEqual({ access_token: 'test-token' });
    });
  });

  describe('login', () => {
    it('should return access token if credentials are valid', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'correct-password',
      };
      
      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockJwtService.sign.mockReturnValue('test-token');
      
      const result = await authService.login(loginDto);
      
      expect(mockUsersService.findByEmail).toHaveBeenCalledWith(loginDto.email);
      expect(bcrypt.compare).toHaveBeenCalledWith(loginDto.password, mockUser.passwordHash);
      expect(mockUsersService.updateLastLogin).toHaveBeenCalledWith(mockUser.id);
      expect(mockJwtService.sign).toHaveBeenCalledWith({ sub: mockUser.id });
      expect(result).toEqual({ access_token: 'test-token' });
    });

    it('should throw UnauthorizedException if user is not found', async () => {
      const loginDto = {
        email: 'nonexistent@example.com',
        password: 'password123',
      };
      
      mockUsersService.findByEmail.mockResolvedValue(null);
      
      await expect(authService.login(loginDto)).rejects.toThrow(UnauthorizedException);
      expect(mockUsersService.findByEmail).toHaveBeenCalledWith(loginDto.email);
    });

    it('should throw UnauthorizedException if password is invalid', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'wrong-password',
      };
      
      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      
      await expect(authService.login(loginDto)).rejects.toThrow(UnauthorizedException);
      expect(bcrypt.compare).toHaveBeenCalledWith(loginDto.password, mockUser.passwordHash);
    });
  });
});
