import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Sound } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-code.enum';
import { CreateSoundDto } from './dto/sounds.dto';

// 기본 알람음은 백엔드가 직접 서빙(/public/sounds). PUBLIC_BASE_URL 없으면 프로덕션 URL 사용.
const PUBLIC_BASE_URL =
  process.env.PUBLIC_BASE_URL ?? 'https://alarmmate-server-production.up.railway.app';
const DEFAULT_SOUND_URL = `${PUBLIC_BASE_URL}/public/sounds/default-alarm.wav`;

interface SoundView {
  id: string;
  name: string;
  url: string;
  isDefault: boolean;
  userId: string | null;
  createdAt: string;
}

@Injectable()
export class SoundsService implements OnModuleInit {
  private readonly logger = new Logger(SoundsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // 배포 시 자동 보정: 존재하지 않는 cdn.alarmmate.app URL을 실제 서빙 URL로 교체하고,
  // 기본 알람음이 하나도 없으면 생성한다(시드 미실행 환경 대비).
  async onModuleInit(): Promise<void> {
    try {
      const fixed = await this.prisma.sound.updateMany({
        where: { isDefault: true, url: { contains: 'cdn.alarmmate.app' } },
        data: { url: DEFAULT_SOUND_URL },
      });
      if (fixed.count > 0) this.logger.log(`기본 알람음 URL ${fixed.count}건 교정`);
      const defaults = await this.prisma.sound.count({ where: { isDefault: true } });
      if (defaults === 0) {
        await this.prisma.sound.create({
          data: { name: '알람 시계', url: DEFAULT_SOUND_URL, isDefault: true },
        });
      }
    } catch (error) {
      this.logger.warn(`기본 알람음 보정 실패: ${String(error)}`);
    }
  }

  async list(userId: string): Promise<SoundView[]> {
    const sounds = await this.prisma.sound.findMany({
      where: {
        OR: [{ isDefault: true }, { userId }],
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    return sounds.map((s) => this.toView(s));
  }

  async create(userId: string, dto: CreateSoundDto): Promise<SoundView> {
    const sound = await this.prisma.sound.create({
      data: {
        name: dto.name,
        url: dto.url,
        userId,
        isDefault: false,
      },
    });
    return this.toView(sound);
  }

  async remove(userId: string, soundId: string): Promise<{ deleted: boolean }> {
    const sound = await this.prisma.sound.findUnique({
      where: { id: soundId },
    });
    if (!sound || sound.userId !== userId || sound.isDefault) {
      throw new AppException(ErrorCode.SOUND_NOT_FOUND);
    }
    await this.prisma.sound.delete({ where: { id: soundId } });
    return { deleted: true };
  }

  private toView(sound: Sound): SoundView {
    return {
      id: sound.id,
      name: sound.name,
      url: sound.url,
      isDefault: sound.isDefault,
      userId: sound.userId,
      createdAt: sound.createdAt.toISOString(),
    };
  }
}
