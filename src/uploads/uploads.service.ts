import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { S3Service } from '../common/services/s3.service';
import { AllowedContentType, PresignedUrlDto } from './dto/uploads.dto';

interface PresignedResponse {
  presignedUrl: string;
  imageUrl: string;
  key: string;
}

const EXTENSION_BY_TYPE: Record<AllowedContentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
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
}
