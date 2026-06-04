import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SilentPushData {
  type: string;
  groupId: string;
  userId: string;
  wokeAt: string;
}

const ONESIGNAL_ENDPOINT = 'https://onesignal.com/api/v1/notifications';

@Injectable()
export class OneSignalService {
  private readonly logger = new Logger(OneSignalService.name);

  constructor(private readonly configService: ConfigService) {}

  async sendSilentPush(
    subscriptionIds: string[],
    data: SilentPushData,
  ): Promise<void> {
    const targets = subscriptionIds.filter(
      (id): id is string => typeof id === 'string' && id.length > 0,
    );
    if (targets.length === 0) {
      return;
    }

    const appId = this.configService.get<string>('ONESIGNAL_APP_ID');
    const apiKey = this.configService.get<string>('ONESIGNAL_API_KEY');

    if (!appId || !apiKey || appId.startsWith('placeholder')) {
      this.logger.warn(
        'OneSignal credentials missing or placeholder; skipping silent push',
      );
      return;
    }

    const body = {
      app_id: appId,
      include_player_ids: targets,
      content_available: true,
      data,
    };

    await this.post(body);
  }

  /** 화면에 표시되는 일반 푸시(배너 + 사운드). 메이트 이모지 리액션 등에 사용. */
  async sendNotification(
    subscriptionIds: string[],
    title: string,
    message: string,
    data?: Record<string, string>,
  ): Promise<void> {
    const targets = subscriptionIds.filter(
      (id): id is string => typeof id === 'string' && id.length > 0,
    );
    if (targets.length === 0) {
      return;
    }
    const appId = this.configService.get<string>('ONESIGNAL_APP_ID');
    const apiKey = this.configService.get<string>('ONESIGNAL_API_KEY');
    if (!appId || !apiKey || appId.startsWith('placeholder')) {
      this.logger.warn('OneSignal credentials missing; skipping push');
      return;
    }
    await this.post({
      app_id: appId,
      include_player_ids: targets,
      headings: { en: title },
      contents: { en: message },
      ...(data ? { data } : {}),
    });
  }

  private async post(body: Record<string, unknown>): Promise<void> {
    const apiKey = this.configService.get<string>('ONESIGNAL_API_KEY');
    try {
      const response = await fetch(ONESIGNAL_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        this.logger.error(
          `OneSignal push failed with status ${response.status}`,
        );
      }
    } catch (error) {
      this.logger.error(
        'OneSignal push request error',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
