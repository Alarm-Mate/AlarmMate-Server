import { Controller, Get } from '@nestjs/common';
import { Public } from './common/decorators/public.decorator';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check(): { status: string } {
    return { status: 'ok' };
  }

  // 임시: Railway 아웃바운드(egress) 공인 IP 확인용. ODsay Server 등록 후 제거 예정.
  @Public()
  @Get('egress-ip')
  async egressIp(): Promise<{ ip: string }> {
    const res = await fetch('https://api.ipify.org?format=json');
    const data = (await res.json()) as { ip: string };
    return { ip: data.ip };
  }
}
