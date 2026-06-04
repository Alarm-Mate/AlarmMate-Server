import { Global, Module } from '@nestjs/common';
import { OneSignalService } from './services/onesignal.service';
import { S3Service } from './services/s3.service';

@Global()
@Module({
  providers: [OneSignalService, S3Service],
  exports: [OneSignalService, S3Service],
})
export class CommonModule {}
