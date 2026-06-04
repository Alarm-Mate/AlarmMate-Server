import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { GroupsService } from './groups.service';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import {
  CreateGroupDto,
  InviteDto,
  TransferOwnerDto,
  UpdateGroupDto,
  WakeStatusQueryDto,
} from './dto/groups.dto';

@Controller('groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.groupsService.listMyGroups(user.userId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateGroupDto) {
    return this.groupsService.createGroup(user.userId, dto);
  }

  @Get(':groupId')
  get(@CurrentUser() user: AuthUser, @Param('groupId') groupId: string) {
    return this.groupsService.getGroup(user.userId, groupId);
  }

  @Patch(':groupId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('groupId') groupId: string,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.groupsService.updateGroup(user.userId, groupId, dto);
  }

  @Delete(':groupId')
  @HttpCode(HttpStatus.OK)
  remove(@CurrentUser() user: AuthUser, @Param('groupId') groupId: string) {
    return this.groupsService.deleteGroup(user.userId, groupId);
  }

  @Post(':groupId/invite')
  @HttpCode(HttpStatus.OK)
  invite(
    @CurrentUser() user: AuthUser,
    @Param('groupId') groupId: string,
    @Body() dto: InviteDto,
  ) {
    return this.groupsService.invite(user.userId, groupId, dto.userId);
  }

  @Post(':groupId/accept')
  @HttpCode(HttpStatus.OK)
  accept(@CurrentUser() user: AuthUser, @Param('groupId') groupId: string) {
    return this.groupsService.accept(user.userId, groupId);
  }

  @Post(':groupId/decline')
  @HttpCode(HttpStatus.OK)
  decline(@CurrentUser() user: AuthUser, @Param('groupId') groupId: string) {
    return this.groupsService.decline(user.userId, groupId);
  }

  @Delete(':groupId/leave')
  @HttpCode(HttpStatus.OK)
  leave(@CurrentUser() user: AuthUser, @Param('groupId') groupId: string) {
    return this.groupsService.leave(user.userId, groupId);
  }

  @Delete(':groupId/members/:userId')
  @HttpCode(HttpStatus.OK)
  kick(
    @CurrentUser() user: AuthUser,
    @Param('groupId') groupId: string,
    @Param('userId') targetUserId: string,
  ) {
    return this.groupsService.kick(user.userId, groupId, targetUserId);
  }

  @Patch(':groupId/toggle')
  toggle(@CurrentUser() user: AuthUser, @Param('groupId') groupId: string) {
    return this.groupsService.toggleMember(user.userId, groupId);
  }

  @Patch(':groupId/owner')
  transferOwner(
    @CurrentUser() user: AuthUser,
    @Param('groupId') groupId: string,
    @Body() dto: TransferOwnerDto,
  ) {
    return this.groupsService.transferOwner(user.userId, groupId, dto);
  }

  @Get(':groupId/wake-status')
  wakeStatus(
    @CurrentUser() user: AuthUser,
    @Param('groupId') groupId: string,
    @Query() query: WakeStatusQueryDto,
  ) {
    return this.groupsService.wakeStatus(user.userId, groupId, query.date);
  }
}
