import { Global, Module } from '@nestjs/common';
import { OneSignalService } from './services/onesignal.service';
import { S3Service } from './services/s3.service';
import { MailService } from './services/mail.service';

@Global()
@Module({
  providers: [OneSignalService, S3Service, MailService],
  exports: [OneSignalService, S3Service, MailService],
})
export class CommonModule {}
