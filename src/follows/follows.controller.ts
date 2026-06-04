import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { FollowsService } from './follows.service';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { CursorQueryDto, DEFAULT_PAGE_LIMIT } from '../common/dto/cursor.dto';

@Controller()
export class FollowsController {
  constructor(private readonly followsService: FollowsService) {}

  @Post('follows/:userId')
  @HttpCode(HttpStatus.CREATED)
  follow(@CurrentUser() user: AuthUser, @Param('userId') userId: string) {
    return this.followsService.follow(user.userId, userId);
  }

  @Delete('follows/:userId')
  @HttpCode(HttpStatus.OK)
  unfollow(@CurrentUser() user: AuthUser, @Param('userId') userId: string) {
    return this.followsService.unfollow(user.userId, userId);
  }

  @Get('users/:userId/followers')
  followers(
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
    @Query() query: CursorQueryDto,
  ) {
    return this.followsService.listFollowers(
      user.userId,
      userId,
      query.cursor,
      query.limit ?? DEFAULT_PAGE_LIMIT,
    );
  }

  @Get('users/:userId/following')
  following(
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
    @Query() query: CursorQueryDto,
  ) {
    return this.followsService.listFollowing(
      user.userId,
      userId,
      query.cursor,
      query.limit ?? DEFAULT_PAGE_LIMIT,
    );
  }
}
