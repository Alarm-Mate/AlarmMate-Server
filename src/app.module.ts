import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { FollowsModule } from './follows/follows.module';
import { AlarmsModule } from './alarms/alarms.module';
import { GroupsModule } from './groups/groups.module';
import { WakeModule } from './wake/wake.module';
import { SocialModule } from './social/social.module';
import { NotificationsModule } from './notifications/notifications.module';
import { UploadsModule } from './uploads/uploads.module';
import { SoundsModule } from './sounds/sounds.module';
import { RingModule } from './ring/ring.module';
import { TransitModule } from './transit/transit.module';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    CommonModule,
    AuthModule,
    UsersModule,
    FollowsModule,
    AlarmsModule,
    GroupsModule,
    WakeModule,
    SocialModule,
    NotificationsModule,
    UploadsModule,
    SoundsModule,
    RingModule,
    TransitModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
