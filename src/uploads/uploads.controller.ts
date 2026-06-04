import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { UploadsService } from './uploads.service';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { PresignedUrlDto } from './dto/uploads.dto';

@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('presigned-url')
  @HttpCode(HttpStatus.OK)
  presignedUrl(
    @CurrentUser() user: AuthUser,
    @Body() dto: PresignedUrlDto,
  ) {
    return this.uploadsService.createPresignedUrl(user.userId, dto);
  }
}
