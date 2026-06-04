import { Controller, Get, Query } from '@nestjs/common';
import { SocialService } from './social.service';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { CursorQueryDto, DEFAULT_PAGE_LIMIT } from '../common/dto/cursor.dto';

@Controller('social')
export class SocialController {
  constructor(private readonly socialService: SocialService) {}

  @Get('feed')
  feed(@CurrentUser() user: AuthUser, @Query() query: CursorQueryDto) {
    return this.socialService.feed(
      user.userId,
      query.cursor,
      query.limit ?? DEFAULT_PAGE_LIMIT,
    );
  }
}
