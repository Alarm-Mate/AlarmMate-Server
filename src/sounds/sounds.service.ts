import { Injectable } from '@nestjs/common';
import { Sound } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-code.enum';
import { CreateSoundDto } from './dto/sounds.dto';

interface SoundView {
  id: string;
  name: string;
  url: string;
  isDefault: boolean;
  userId: string | null;
  createdAt: string;
}

@Injectable()
export class SoundsService {
  constructor(private readonly prisma: PrismaService) {}

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
