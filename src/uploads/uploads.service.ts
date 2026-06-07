import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { S3Service } from '../common/services/s3.service';
import {
  AllowedAudioContentType,
  AllowedContentType,
  AudioPresignedUrlDto,
  PresignedUrlDto,
} from './dto/uploads.dto';

interface PresignedResponse {
  presignedUrl: string;
  imageUrl: string;
  key: string;
}

interface AudioPresignedResponse {
  presignedUrl: string;
  fileUrl: string;
  key: string;
}

const EXTENSION_BY_TYPE: Record<AllowedContentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

const AUDIO_EXTENSION_BY_TYPE: Record<AllowedAudioContentType, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/wav': 'wav',
};

@Injectable()
export class UploadsService {
  constructor(private readonly s3Service: S3Service) {}

  async createPresignedUrl(
    userId: string,
    dto: PresignedUrlDto,
  ): Promise<PresignedResponse> {
    const extension = EXTENSION_BY_TYPE[dto.contentType];
    const key = `profiles/${userId}/${randomUUID()}.${extension}`;
    const result = await this.s3Service.createPresignedUpload(
      key,
      dto.contentType,
    );
    return {
      presignedUrl: result.presignedUrl,
      imageUrl: result.imageUrl,
      key: result.key,
    };
  }

  async createAudioPresignedUrl(
    userId: string,
    dto: AudioPresignedUrlDto,
  ): Promise<AudioPresignedResponse> {
    const extension = AUDIO_EXTENSION_BY_TYPE[dto.contentType];
    const key = `sounds/${userId}/${randomUUID()}.${extension}`;
    const result = await this.s3Service.createPresignedUpload(
      key,
      dto.contentType,
    );
    return {
      presignedUrl: result.presignedUrl,
      fileUrl: result.imageUrl,
      key: result.key,
    };
  }
}
