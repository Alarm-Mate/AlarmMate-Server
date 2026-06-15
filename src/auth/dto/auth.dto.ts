import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

// 온보딩 경로 검증 메시지는 사용자에게 노출되므로 한국어로.
const M_EMAIL = { message: '올바른 이메일 형식이 아니에요' };
const M_PW = { message: '비밀번호는 8자 이상이어야 해요' };
const M_PW_STR = { message: '비밀번호를 입력해주세요' };
const M_NICK = { message: '닉네임을 입력해주세요' };
const M_CODE = { message: '인증 코드 6자리를 입력해주세요' };

export class RegisterDto {
  @IsEmail({}, M_EMAIL)
  email!: string;

  @IsString(M_PW_STR)
  @MinLength(8, M_PW)
  password!: string;

  @IsString(M_NICK)
  @MinLength(1, M_NICK)
  nickname!: string;

  @IsOptional()
  @IsString()
  birthDate?: string;
}

export class LoginDto {
  @IsEmail({}, M_EMAIL)
  email!: string;

  @IsString(M_PW_STR)
  password!: string;
}

export class RefreshDto {
  @IsString()
  refreshToken!: string;
}

export class LogoutDto {
  @IsString()
  refreshToken!: string;
}

export class ForgotPasswordDto {
  @IsEmail({}, M_EMAIL)
  email!: string;
}

export class RequestVerificationDto {
  @IsEmail({}, M_EMAIL)
  email!: string;
}

export class VerifyEmailDto {
  @IsEmail({}, M_EMAIL)
  email!: string;

  @IsString(M_CODE)
  @MinLength(6, M_CODE)
  @MaxLength(6, M_CODE)
  code!: string;
}

export class ResetPasswordDto {
  @IsEmail({}, M_EMAIL)
  email!: string;

  @IsString(M_CODE)
  @MinLength(6, M_CODE)
  @MaxLength(6, M_CODE)
  code!: string;

  @IsString(M_PW_STR)
  @MinLength(8, M_PW)
  newPassword!: string;
}
