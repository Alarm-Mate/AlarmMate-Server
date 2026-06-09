import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SilentPushData {
  type: string;
  groupId: string;
  userId?: string;
  wokeAt?: string;
  groupName?: string;
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

  /**
   * 그룹 자동 재울림 푸시. 안 깬 멤버에게 소리+배너로 다시 알린다.
   * iOS는 앱을 강제로 열거나 무음을 뚫을 수 없으므로, time-sensitive 알림 + 사운드가
   * 서버가 할 수 있는 최선의 "재울림"이다. (앱이 켜지면 data로 인앱 오디오 루프 트리거)
   */
  async sendGroupReRing(
    subscriptionIds: string[],
    groupName: string,
    attempt: number,
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
      this.logger.warn('OneSignal credentials missing; skipping re-ring push');
      return;
    }
    await this.post({
      app_id: appId,
      include_player_ids: targets,
      headings: { en: `${groupName} 메이트가 기다려요` },
      contents: { en: '아직 못 일어난 메이트가 있어요. 일어났다고 알려주세요!' },
      content_available: true,
      priority: 10,
      ios_interruption_level: 'time-sensitive',
      ios_sound: 'default',
      android_sound: 'default',
      data: { type: 'GROUP_RERING', attempt: String(attempt) },
    });
  }

  /** 화면 표시 없는 데이터 전용 푸시(앱 깨워 동기화). 막차 재계산 알림 등에 사용. */
  async sendDataPush(
    subscriptionIds: string[],
    data: Record<string, string>,
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
      this.logger.warn('OneSignal credentials missing; skipping data push');
      return;
    }
    await this.post({
      app_id: appId,
      include_player_ids: targets,
      content_available: true,
      data,
    });
  }

  private async post(body: Record<string, unknown>): Promise<void> {
    const apiKey = this.configService.get<string>('ONESIGNAL_API_KEY') ?? '';
    // 신형 키(os_v2_...)는 'Key' 스킴, 레거시 REST API Key는 'Basic' 스킴.
    const authorization = apiKey.startsWith('os_v2_')
      ? `Key ${apiKey}`
      : `Basic ${apiKey}`;
    try {
      const response = await fetch(ONESIGNAL_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authorization,
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
