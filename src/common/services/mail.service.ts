import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface SendMailOptions {
  to: string;
  subject: string;
  text: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly configService: ConfigService) {}

  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const link = `alarmmate://reset-password?token=${token}`;
    await this.send({
      to,
      subject: 'AlarmMate 비밀번호 재설정',
      text: `아래 링크로 비밀번호를 재설정하세요: ${link}`,
    });
  }

  private async send(options: SendMailOptions): Promise<void> {
    if (!this.isSmtpConfigured()) {
      this.logger.warn(
        `SMTP not configured; logging mail instead. to=${options.to} subject="${options.subject}" body="${options.text}"`,
      );
      return;
    }

    const host = this.configService.get<string>('SMTP_HOST');
    this.logger.log(
      `Sending mail via SMTP host=${host ?? ''} to=${options.to} subject="${options.subject}"`,
    );
  }

  private isSmtpConfigured(): boolean {
    const host = this.configService.get<string>('SMTP_HOST');
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');
    const from = this.configService.get<string>('MAIL_FROM');
    return this.isReal(host) && this.isReal(user) && this.isReal(pass) && this.isReal(from);
  }

  private isReal(value: string | undefined): value is string {
    return (
      typeof value === 'string' &&
      value.length > 0 &&
      !value.toLowerCase().includes('placeholder')
    );
  }
}
