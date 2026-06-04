import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface PresignedUploadResult {
  presignedUrl: string;
  imageUrl: string;
  key: string;
}

const PRESIGN_EXPIRES_SECONDS = 600;

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly client: S3Client;
  private readonly region: string;
  private readonly bucket: string;
  // 공개 URL 베이스. R2/MinIO 등은 업로드 엔드포인트와 공개 도메인이 달라 별도 지정한다.
  // (R2: https://pub-xxxx.r2.dev, 미지정 시 AWS S3 가상호스팅 URL로 폴백)
  private readonly publicBaseUrl: string | null;

  constructor(private readonly configService: ConfigService) {
    this.region = this.configService.get<string>('AWS_REGION') ?? 'ap-northeast-2';
    this.bucket = this.configService.get<string>('AWS_S3_BUCKET') ?? 'alarmmate-uploads';
    const accessKeyId =
      this.configService.get<string>('AWS_ACCESS_KEY_ID') ?? 'placeholder';
    const secretAccessKey =
      this.configService.get<string>('AWS_SECRET_ACCESS_KEY') ?? 'placeholder';
    // S3 호환 스토리지(Cloudflare R2·MinIO 등)용 커스텀 엔드포인트. 미지정 시 AWS S3.
    const endpoint = this.configService.get<string>('S3_ENDPOINT')?.trim() || undefined;
    this.publicBaseUrl =
      this.configService.get<string>('S3_PUBLIC_BASE_URL')?.trim().replace(/\/$/, '') || null;

    this.client = new S3Client({
      region: this.region,
      credentials: { accessKeyId, secretAccessKey },
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    });
  }

  async createPresignedUpload(
    key: string,
    contentType: string,
  ): Promise<PresignedUploadResult> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });

    const presignedUrl = await getSignedUrl(this.client, command, {
      expiresIn: PRESIGN_EXPIRES_SECONDS,
    });

    const imageUrl = this.publicBaseUrl
      ? `${this.publicBaseUrl}/${key}`
      : `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
    return { presignedUrl, imageUrl, key };
  }
}
