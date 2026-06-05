import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface SendMailOptions {
  to: string;
  subject: string;
  /** 일반 텍스트 폴백 (HTML 미지원 클라이언트용) */
  text: string;
  /** 선택: 브랜드 HTML 본문 */
  html?: string;
}

const SENDGRID_ENDPOINT = 'https://api.sendgrid.com/v3/mail/send';

// 알람메이트 브랜드 컬러
const COLOR = {
  bg: '#0a0b12',
  card: '#14151f',
  border: '#262838',
  accent: '#f5841a',
  accent2: '#ff5e7e',
  text: '#f0f0ff',
  muted: '#9a9aad',
  faint: '#5a5b6a',
  codeBg: 'rgba(245,132,26,0.08)',
  codeBorder: 'rgba(245,132,26,0.40)',
};
const FONT =
  "-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic','Segoe UI',Roboto,sans-serif";

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
      html: this.codeEmail({
        heading: '비밀번호 재설정',
        intro: '아래 인증 코드를 앱에 입력해 비밀번호를 재설정하세요.',
        codeLabel: '재설정 코드',
        code,
        footnote:
          '코드는 10분간 유효해요. 본인이 요청하지 않았다면 이 메일은 무시하셔도 됩니다.',
      }),
    });
  }

  // 회원가입 이메일 인증 6자리 코드
  async sendVerificationCode(to: string, code: string): Promise<void> {
    await this.send({
      to,
      subject: 'AlarmMate 이메일 인증 코드',
      text: `이메일 인증 코드는 [${code}] 입니다.\n앱에서 이 코드를 입력해 회원가입을 완료하세요. (10분간 유효)`,
      html: this.codeEmail({
        heading: '이메일 인증',
        intro: '회원가입을 마치려면 아래 인증 코드를 앱에 입력해주세요.',
        codeLabel: '인증 코드',
        code,
        footnote:
          '코드는 10분간 유효해요. 본인이 요청하지 않았다면 이 메일은 무시하셔도 됩니다.',
      }),
    });
  }

  // 가입 축하 메일
  async sendWelcomeEmail(to: string, nickname: string): Promise<void> {
    await this.send({
      to,
      subject: 'AlarmMate에 오신 걸 환영해요 🎉',
      text: `${nickname}님, 환영합니다!\n메이트와 함께 일어나는 습관, 알람메이트와 시작해봐요.`,
      html: this.welcomeEmail(nickname),
    });
  }

  // ── 이메일 템플릿 ─────────────────────────────────────────────

  private codeEmail(opts: {
    heading: string;
    intro: string;
    codeLabel: string;
    code: string;
    footnote: string;
  }): string {
    const codeBlock = `
      <tr><td style="padding:8px 36px 4px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td align="center" style="background:${COLOR.codeBg};border:1px solid ${COLOR.codeBorder};border-radius:16px;padding:24px 16px;">
            <div style="font-size:12px;letter-spacing:2px;color:${COLOR.muted};text-transform:uppercase;margin-bottom:12px;">${opts.codeLabel}</div>
            <div style="font-size:40px;line-height:1;font-weight:800;letter-spacing:12px;color:${COLOR.accent};text-indent:12px;">${opts.code}</div>
          </td></tr>
        </table>
      </td></tr>`;
    return this.layout({
      heading: opts.heading,
      intro: opts.intro,
      contentHtml: codeBlock,
      footnote: opts.footnote,
    });
  }

  private welcomeEmail(nickname: string): string {
    const safeName = this.escape(nickname);
    const content = `
      <tr><td style="padding:8px 36px 4px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="background:${COLOR.codeBg};border:1px solid ${COLOR.codeBorder};border-radius:16px;padding:22px 24px;">
            <div style="font-size:15px;line-height:1.7;color:${COLOR.text};">
              메이트와 함께 일어나는 습관,<br/>
              <span style="color:${COLOR.accent};font-weight:700;">알람메이트</span>와 시작해봐요. ⏰
            </div>
          </td></tr>
        </table>
      </td></tr>`;
    return this.layout({
      heading: `${safeName}님, 환영해요! 🎉`,
      intro: '함께 깨워줄 메이트를 찾고, 오늘부터 아침을 바꿔보세요.',
      contentHtml: content,
      footnote: '언제든 앱에서 알람과 메이트를 관리할 수 있어요.',
    });
  }

  /** 공통 브랜드 레이아웃 */
  private layout(opts: {
    heading: string;
    intro: string;
    contentHtml: string;
    footnote: string;
  }): string {
    return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="dark"/>
<meta name="supported-color-schemes" content="dark"/>
<title>AlarmMate</title>
</head>
<body style="margin:0;padding:0;background:${COLOR.bg};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLOR.bg};padding:32px 12px;font-family:${FONT};">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:460px;background:${COLOR.card};border:1px solid ${COLOR.border};border-radius:22px;overflow:hidden;">
      <tr><td style="height:6px;line-height:6px;font-size:6px;background:${COLOR.accent};background:linear-gradient(90deg,${COLOR.accent},${COLOR.accent2});">&nbsp;</td></tr>
      <tr><td style="padding:34px 36px 0;">
        <div style="font-size:19px;font-weight:800;color:${COLOR.text};letter-spacing:-0.3px;">
          <span style="display:inline-block;width:26px;height:26px;line-height:26px;text-align:center;background:${COLOR.codeBg};border:1px solid ${COLOR.codeBorder};border-radius:8px;font-size:14px;vertical-align:middle;margin-right:8px;">⏰</span>
          <span style="vertical-align:middle;">알람메이트</span>
        </div>
      </td></tr>
      <tr><td style="padding:22px 36px 0;">
        <h1 style="margin:0;font-size:23px;line-height:1.35;font-weight:800;color:${COLOR.text};letter-spacing:-0.4px;">${opts.heading}</h1>
        <p style="margin:10px 0 0;font-size:14px;line-height:1.65;color:${COLOR.muted};">${opts.intro}</p>
      </td></tr>
      <tr><td style="height:18px;line-height:18px;font-size:18px;">&nbsp;</td></tr>
      ${opts.contentHtml}
      <tr><td style="padding:16px 36px 30px;">
        <p style="margin:0;font-size:13px;line-height:1.6;color:${COLOR.muted};">${opts.footnote}</p>
      </td></tr>
      <tr><td style="padding:18px 36px 26px;border-top:1px solid ${COLOR.border};">
        <p style="margin:0;font-size:12px;line-height:1.6;color:${COLOR.faint};">
          이 메일은 발신 전용이에요 · 문의는 앱에서 가능해요<br/>
          © 2026 AlarmMate · alarmmates.app
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
  }

  private escape(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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

    // SendGrid: content 배열은 text/plain → text/html 순서여야 한다.
    const content: { type: string; value: string }[] = [
      { type: 'text/plain', value: options.text },
    ];
    if (options.html) {
      content.push({ type: 'text/html', value: options.html });
    }

    const body = {
      personalizations: [{ to: [{ email: options.to }] }],
      from: { email: from, name: '알람메이트' },
      subject: options.subject,
      content,
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
