import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface SendMailOptions {
  to: string;
  subject: string;
  text: string;
}

const SENDGRID_ENDPOINT = 'https://api.sendgrid.com/v3/mail/send';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly configService: ConfigService) {}

  // 비밀번호 재설정 6자리 코드 메일
  async sendPasswordResetCode(to: string, code: string): Promise<void> {
    await this.send({
      to,
      subject: 'AlarmMate 비밀번호 재설정 코드',
      text: `비밀번호 재설정 코드는 [${code}] 입니다.\n앱에서 이 코드를 입력해 비밀번호를 재설정하세요. (10분간 유효)`,
    });
  }

  // 가입 축하 메일
  async sendWelcomeEmail(to: string, nickname: string): Promise<void> {
    await this.send({
      to,
      subject: 'AlarmMate에 오신 걸 환영해요 🎉',
      text: `${nickname}님, 환영합니다!\n메이트와 함께 일어나는 습관, 알람메이트와 시작해봐요.`,
    });
  }

  private async send(options: SendMailOptions): Promise<void> {
    const apiKey = this.configService.get<string>('SENDGRID_API_KEY');
    const from = this.configService.get<string>('MAIL_FROM');

    if (!this.isReal(apiKey) || !this.isReal(from)) {
      this.logger.warn(
        `Mail provider not configured; logging instead. to=${options.to} subject="${options.subject}" body="${options.text}"`,
      );
      return;
    }

    const body = {
      personalizations: [{ to: [{ email: options.to }] }],
      from: { email: from },
      subject: options.subject,
      content: [{ type: 'text/plain', value: options.text }],
    };

    try {
      const res = await fetch(SENDGRID_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        this.logger.error(`SendGrid mail failed: status ${res.status}`);
      }
    } catch (error) {
      this.logger.error(
        'SendGrid request error',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private isReal(value: string | undefined): value is string {
    return (
      typeof value === 'string' &&
      value.length > 0 &&
      !value.toLowerCase().includes('placeholder')
    );
  }
}
