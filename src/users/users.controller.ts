import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { UsersService } from './users.service';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { DEFAULT_PAGE_LIMIT } from '../common/dto/cursor.dto';
import {
  GrassQueryDto,
  SearchUsersDto,
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

  @Get(':userId')
  getProfile(
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
  ) {
    return this.usersService.getPublicProfile(user.userId, userId);
  }
}
