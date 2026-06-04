import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { CursorQueryDto, DEFAULT_PAGE_LIMIT } from '../common/dto/cursor.dto';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: CursorQueryDto) {
    return this.notificationsService.list(
      user.userId,
      query.cursor,
      query.limit ?? DEFAULT_PAGE_LIMIT,
    );
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.OK)
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.notificationsService.markAllRead(user.userId);
  }

  @Patch(':notificationId/read')
  @HttpCode(HttpStatus.OK)
  markRead(
    @CurrentUser() user: AuthUser,
    @Param('notificationId') notificationId: string,
  ) {
    return this.notificationsService.markRead(user.userId, notificationId);
  }
}
