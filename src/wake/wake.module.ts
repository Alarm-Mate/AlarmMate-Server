import { Module } from '@nestjs/common';
import { WakeController } from './wake.controller';
import { WakeService } from './wake.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [WakeController],
  providers: [WakeService],
  exports: [WakeService],
})
export class WakeModule {}
