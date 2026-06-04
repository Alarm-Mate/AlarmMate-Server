import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { UsersService } from './users.service';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { DEFAULT_PAGE_LIMIT } from '../common/dto/cursor.dto';
import {
  GrassQueryDto,
  SearchUsersDto,
  SendReactionDto,
  UpdateMeDto,
  UpdateOneSignalDto,
} from './dto/users.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getMe(@CurrentUser() user: AuthUser) {
    return this.usersService.getMe(user.userId);
  }

  @Patch('me')
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateMeDto) {
    return this.usersService.updateMe(user.userId, dto);
  }

  @Patch('me/onesignal')
  updateOneSignal(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateOneSignalDto,
  ) {
    return this.usersService.updateOneSignal(
      user.userId,
      dto.oneSignalSubscriptionId,
    );
  }

  @Get('search')
  search(@CurrentUser() user: AuthUser, @Query() query: SearchUsersDto) {
    return this.usersService.search(
      user.userId,
      query.nickname,
      query.cursor,
      query.limit ?? DEFAULT_PAGE_LIMIT,
    );
  }

  // 소셜 탐색: 사람들 + 알람 (검색어 없이 둘러보기)
  @Get('discover')
  discover(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    return this.usersService.getDiscover(user.userId, limit ? Number(limit) : 20);
  }

  @Get(':userId/grass')
  grass(
    @Param('userId') userId: string,
    @Query() query: GrassQueryDto,
  ) {
    return this.usersService.getGrass(userId, query.weeks ?? 12);
  }

  // 메이트 알람 공유: 대상 유저의 알람 목록 + 오늘 기상 여부
  @Get(':userId/alarms')
  userAlarms(@Param('userId') userId: string) {
    return this.usersService.getUserAlarms(userId);
  }

  // 메이트에게 이모지 리액션 전송
  @Post(':userId/reactions')
  sendReaction(
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
    @Body() dto: SendReactionDto,
  ) {
    return this.usersService.sendReaction(user.userId, userId, dto);
  }

  @Get(':userId')
  getProfile(
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
  ) {
    return this.usersService.getPublicProfile(user.userId, userId);
  }
}
