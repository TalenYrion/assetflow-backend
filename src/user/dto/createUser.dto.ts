import { IsEmail, IsOptional, IsString, IsUrl, Length } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @Length(1, 20)
  firstName: string;

  @IsString()
  @Length(1, 20)
  lastName: string;

  @IsString()
  @IsEmail()
  email: string;

  @IsString()
  password: string;

  @IsString()
  @IsOptional()
  bio: string;

  @IsString()
  @IsUrl()
  @IsOptional()
  avatarUrl: string;
}
