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

  constructor(private readonly configService: ConfigService) {
    this.region = this.configService.get<string>('AWS_REGION') ?? 'ap-northeast-2';
    this.bucket = this.configService.get<string>('AWS_S3_BUCKET') ?? 'alarmmate-uploads';
    const accessKeyId =
      this.configService.get<string>('AWS_ACCESS_KEY_ID') ?? 'placeholder';
    const secretAccessKey =
      this.configService.get<string>('AWS_SECRET_ACCESS_KEY') ?? 'placeholder';

    this.client = new S3Client({
      region: this.region,
      credentials: { accessKeyId, secretAccessKey },
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

    const imageUrl = `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
    return { presignedUrl, imageUrl, key };
  }
}
