import { randomInt, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-code.enum';
import { MailService } from '../common/services/mail.service';
import { JwtPayload } from './jwt.strategy';
import {
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
} from './dto/auth.dto';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface AuthResult extends TokenPair {
  user: {
    id: string;
    email: string;
    nickname: string;
  };
}

const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    if (!PASSWORD_REGEX.test(dto.password)) {
      throw new AppException(ErrorCode.INVALID_PASSWORD_FORMAT);
    }

    const existingEmail = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existingEmail) {
      throw new AppException(ErrorCode.EMAIL_ALREADY_EXISTS);
    }

    const existingNickname = await this.prisma.user.findUnique({
      where: { nickname: dto.nickname },
    });
    if (existingNickname) {
      throw new AppException(ErrorCode.NICKNAME_ALREADY_EXISTS);
    }

    // 이메일 인증 완료 여부 확인 (request-verification → verify-email 선행 필요)
    const verified = await this.prisma.emailVerification.findFirst({
      where: { email: dto.email, verified: true, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!verified) {
      throw new AppException(ErrorCode.EMAIL_NOT_VERIFIED);
    }

    const hashed = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashed,
        nickname: dto.nickname,
        ...(dto.birthDate !== undefined ? { birthDate: dto.birthDate } : {}),
      },
    });
    await this.prisma.emailVerification.deleteMany({ where: { email: dto.email } });

    const tokens = await this.issueAndStore(user.id, user.email);
    // 가입 축하 메일(실패 무관, fire-and-forget)
    void this.mailService.sendWelcomeEmail(user.email, user.nickname);
    return {
      ...tokens,
      user: { id: user.id, email: user.email, nickname: user.nickname },
    };
  }

  // 회원가입 이메일 인증 코드 발송 (가입 전, 이메일 기준)
  async requestEmailVerification(email: string): Promise<{ requested: boolean }> {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new AppException(ErrorCode.EMAIL_ALREADY_EXISTS);
    }
    await this.prisma.emailVerification.deleteMany({ where: { email } });
    const code = String(randomInt(100000, 1000000));
    await this.prisma.emailVerification.create({
      data: { email, code, expiresAt: new Date(Date.now() + RESET_TTL_MS) },
    });
    await this.mailService.sendVerificationCode(email, code);
    return { requested: true };
  }

  // 코드 확인 → 인증 완료 표시
  async verifyEmailCode(email: string, code: string): Promise<{ verified: boolean }> {
    const record = await this.prisma.emailVerification.findFirst({
      where: { email, code, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!record) {
      throw new AppException(ErrorCode.INVALID_VERIFICATION_CODE);
    }
    await this.prisma.emailVerification.update({
      where: { id: record.id },
      data: { verified: true },
    });
    return { verified: true };
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) {
      throw new AppException(ErrorCode.INVALID_CREDENTIALS);
    }
    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) {
      throw new AppException(ErrorCode.INVALID_CREDENTIALS);
    }

    const tokens = await this.issueAndStore(user.id, user.email);
    return {
      ...tokens,
      user: { id: user.id, email: user.email, nickname: user.nickname },
    };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new AppException(ErrorCode.INVALID_REFRESH_TOKEN);
    }

    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
    });
    if (!stored || stored.userId !== payload.sub) {
      throw new AppException(ErrorCode.INVALID_REFRESH_TOKEN);
    }
    if (stored.expiresAt.getTime() < Date.now()) {
      await this.prisma.refreshToken.delete({ where: { id: stored.id } });
      throw new AppException(ErrorCode.INVALID_REFRESH_TOKEN);
    }

    await this.prisma.refreshToken.delete({ where: { id: stored.id } });
    return this.issueAndStore(payload.sub, payload.email);
  }

  async logout(refreshToken: string): Promise<{ success: boolean }> {
    await this.prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
    return { success: true };
  }

  async forgotPassword(
    dto: ForgotPasswordDto,
  ): Promise<{ requested: boolean }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (user) {
      // 기존 미사용 코드 정리 후 새 6자리 코드 발급
      await this.prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
      const code = String(randomInt(100000, 1000000));
      await this.prisma.passwordResetToken.create({
        data: {
          token: code,
          userId: user.id,
          expiresAt: new Date(Date.now() + RESET_TTL_MS),
        },
      });
      await this.mailService.sendPasswordResetCode(user.email, code);
    }
    return { requested: true };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ reset: boolean }> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      throw new AppException(ErrorCode.INVALID_RESET_TOKEN);
    }
    const record = await this.prisma.passwordResetToken.findFirst({
      where: { userId: user.id, token: dto.code, used: false },
      orderBy: { createdAt: 'desc' },
    });
    if (!record || record.expiresAt.getTime() < Date.now()) {
      throw new AppException(ErrorCode.INVALID_RESET_TOKEN);
    }
    if (!PASSWORD_REGEX.test(dto.newPassword)) {
      throw new AppException(ErrorCode.INVALID_PASSWORD_FORMAT);
    }

    const hashed = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: record.userId },
        data: { password: hashed },
      });
      await tx.passwordResetToken.update({
        where: { id: record.id },
        data: { used: true },
      });
      await tx.refreshToken.deleteMany({ where: { userId: record.userId } });
    });

    return { reset: true };
  }

  async withdraw(userId: string): Promise<{ success: boolean }> {
    await this.prisma.user.delete({ where: { id: userId } });
    return { success: true };
  }

  private async issueAndStore(
    userId: string,
    email: string,
  ): Promise<TokenPair> {
    const accessPayload: JwtPayload = { sub: userId, email, jti: randomUUID() };
    const refreshPayload: JwtPayload = { sub: userId, email, jti: randomUUID() };
    const accessToken = await this.jwtService.signAsync(accessPayload, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '1h',
    });
    const refreshToken = await this.jwtService.signAsync(refreshPayload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn:
        this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '30d',
    });

    await this.prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId,
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });

    return { accessToken, refreshToken };
  }
}
