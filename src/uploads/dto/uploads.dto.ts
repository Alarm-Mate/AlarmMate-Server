import { IsIn, IsInt, Max, Min } from 'class-validator';

export const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
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

export const ALLOWED_AUDIO_CONTENT_TYPES = [
  'audio/mpeg',
  'audio/mp4',
  'audio/aac',
  'audio/wav',
] as const;

export type AllowedAudioContentType =
  (typeof ALLOWED_AUDIO_CONTENT_TYPES)[number];

export const MAX_AUDIO_UPLOAD_BYTES = 10 * 1024 * 1024;

export class AudioPresignedUrlDto {
  @IsIn(ALLOWED_AUDIO_CONTENT_TYPES)
  contentType!: AllowedAudioContentType;

  @IsInt()
  @Min(1)
  @Max(MAX_AUDIO_UPLOAD_BYTES)
  fileSize!: number;
}
