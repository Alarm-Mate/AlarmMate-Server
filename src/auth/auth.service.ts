import { randomInt, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
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
// 인증/재설정 코드 재발송 최소 간격(스팸·무차별 대입 완화).
const CODE_COOLDOWN_MS = 60 * 1000;
// 6자리 코드 오입력 허용 횟수(초과 시 코드 폐기 → 재발송 필요).
const MAX_CODE_ATTEMPTS = 5;

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
    // 재발송 쿨다운: 최근 발송이 60초 이내면 거부.
    const recent = await this.prisma.emailVerification.findFirst({
      where: { email },
      orderBy: { createdAt: 'desc' },
    });
    if (recent && Date.now() - recent.createdAt.getTime() < CODE_COOLDOWN_MS) {
      throw new AppException(ErrorCode.TOO_MANY_REQUESTS);
    }
    await this.prisma.emailVerification.deleteMany({ where: { email } });
    const code = String(randomInt(100000, 1000000));
    await this.prisma.emailVerification.create({
      data: { email, code, expiresAt: new Date(Date.now() + RESET_TTL_MS) },
    });
    try {
      await this.mailService.sendVerificationCode(email, code);
    } catch {
      // 발송 실패 시 코드 정리 + 명확한 에러(가입 차단 원인불명 방지).
      await this.prisma.emailVerification.deleteMany({ where: { email } });
      throw new AppException(ErrorCode.MAIL_SEND_FAILED);
    }
    return { requested: true };
  }

  // 코드 확인 → 인증 완료 표시. 무차별 대입 방지: 같은 이메일의 최신 코드에 오입력 5회 누적 시 폐기.
  async verifyEmailCode(email: string, code: string): Promise<{ verified: boolean }> {
    const latest = await this.prisma.emailVerification.findFirst({
      where: { email, verified: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!latest) {
      throw new AppException(ErrorCode.INVALID_VERIFICATION_CODE);
    }
    if (latest.attempts >= MAX_CODE_ATTEMPTS) {
      // 시도 횟수 초과 → 코드 폐기(재발송 필요)
      await this.prisma.emailVerification.delete({ where: { id: latest.id } });
      throw new AppException(ErrorCode.INVALID_VERIFICATION_CODE);
    }
    if (latest.code !== code) {
      await this.prisma.emailVerification.update({
        where: { id: latest.id },
        data: { attempts: { increment: 1 } },
      });
      throw new AppException(ErrorCode.INVALID_VERIFICATION_CODE);
    }
    await this.prisma.emailVerification.update({
      where: { id: latest.id },
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

  async logout(
    userId: string,
    refreshToken: string,
  ): Promise<{ success: boolean }> {
    // 본인 소유의 리프레시 토큰만 폐기.
    await this.prisma.refreshToken.deleteMany({
      where: { token: refreshToken, userId },
    });
    return { success: true };
  }

  async forgotPassword(
    dto: ForgotPasswordDto,
  ): Promise<{ requested: boolean }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (user) {
      // 재발송 쿨다운: 최근 발급이 60초 이내면 거부.
      const recent = await this.prisma.passwordResetToken.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
      });
      if (recent && Date.now() - recent.createdAt.getTime() < CODE_COOLDOWN_MS) {
        throw new AppException(ErrorCode.TOO_MANY_REQUESTS);
      }
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
      try {
        await this.mailService.sendPasswordResetCode(user.email, code);
      } catch {
        await this.prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
        throw new AppException(ErrorCode.MAIL_SEND_FAILED);
      }
    }
    return { requested: true };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ reset: boolean }> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      throw new AppException(ErrorCode.INVALID_RESET_TOKEN);
    }
    // 무차별 대입 방지: 최신 미사용 코드 기준으로 오입력 5회 누적 시 폐기.
    const latest = await this.prisma.passwordResetToken.findFirst({
      where: { userId: user.id, used: false },
      orderBy: { createdAt: 'desc' },
    });
    if (!latest || latest.expiresAt.getTime() < Date.now()) {
      throw new AppException(ErrorCode.INVALID_RESET_TOKEN);
    }
    if (latest.attempts >= MAX_CODE_ATTEMPTS) {
      await this.prisma.passwordResetToken.update({
        where: { id: latest.id },
        data: { used: true },
      });
      throw new AppException(ErrorCode.INVALID_RESET_TOKEN);
    }
    if (latest.token !== dto.code) {
      await this.prisma.passwordResetToken.update({
        where: { id: latest.id },
        data: { attempts: { increment: 1 } },
      });
      throw new AppException(ErrorCode.INVALID_RESET_TOKEN);
    }
    const record = latest;
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
    // 내가 OWNER인 그룹 처리: 다른 멤버가 있으면 가장 오래된 멤버에게 소유권 이전,
    // 혼자면 그룹 삭제. (오너 탈퇴 후 그룹이 관리 불능 고아가 되는 것 방지)
    const ownedMemberships = await this.prisma.groupMember.findMany({
      where: { userId, role: 'OWNER' },
      select: { groupId: true },
    });
    for (const { groupId } of ownedMemberships) {
      const nextOwner = await this.prisma.groupMember.findFirst({
        where: { groupId, userId: { not: userId } },
        orderBy: { joinedAt: 'asc' },
        select: { id: true },
      });
      if (nextOwner) {
        await this.prisma.groupMember.update({
          where: { id: nextOwner.id },
          data: { role: 'OWNER' },
        });
      } else {
        // 남은 멤버 없음 → 그룹 삭제(멤버·알람·초대 등 Cascade 정리)
        await this.prisma.group.delete({ where: { id: groupId } });
      }
    }
    // GroupInvitation FK가 Cascade이므로 user 삭제가 초대 이력 때문에 막히지 않는다.
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
