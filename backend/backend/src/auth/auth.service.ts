import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(payload: JwtPayload): Promise<any> {
    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException();
    }
    return user;
  }

  async register(registerDto: RegisterDto): Promise<{ access_token: string }> {
    const user = await this.usersService.create(registerDto);
    return this.generateToken(user.id);
  }

  async login(loginDto: LoginDto): Promise<{ access_token: string }> {
    const { email, password } = loginDto;
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Update last login timestamp
    await this.usersService.updateLastLogin(user.id);

    return this.generateToken(user.id);
  }

  private async generateToken(userId: string): Promise<{ access_token: string }> {
    const payload: JwtPayload = { sub: userId };
    const token = this.jwtService.sign(payload);
    return { access_token: token };
  }
}
