import { IsEmail, IsNotEmpty, IsString, MinLength, MaxLength } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'Please enter a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  password: string;

  @IsString()
  @IsNotEmpty({ message: 'First name is required' })
  @MaxLength(50, { message: 'First name cannot exceed 50 characters' })
  firstName: string;

  @IsString()
  @IsNotEmpty({ message: 'Last name is required' })
  @MaxLength(50, { message: 'Last name cannot exceed 50 characters' })
  lastName: string;
}
