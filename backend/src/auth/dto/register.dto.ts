// file định nghĩa và kiểm tra dữ liệu đầu vào cho chức năng register.
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  @Matches(/\S/, { message: 'Họ tên không được để trống' })
  @MaxLength(100)
  fullName: string;

  @IsString()
  @Matches(/\S/, { message: 'Tên đăng nhập không được để trống' })
  @MaxLength(50)
  username: string;

  @IsEmail()
  @MaxLength(100)
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(15)
  phone?: string;
}
