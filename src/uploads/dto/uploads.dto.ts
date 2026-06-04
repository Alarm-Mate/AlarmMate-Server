import { IsIn, IsInt, Max, Min } from 'class-validator';

export const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type AllowedContentType = (typeof ALLOWED_CONTENT_TYPES)[number];

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export class PresignedUrlDto {
  @IsIn(ALLOWED_CONTENT_TYPES)
  contentType!: AllowedContentType;

  @IsInt()
  @Min(1)
  @Max(MAX_UPLOAD_BYTES)
  fileSize!: number;
}
