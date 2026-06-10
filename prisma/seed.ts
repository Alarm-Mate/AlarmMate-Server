import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 기본 알람음은 백엔드 정적 파일(/public/sounds)에서 서빙된다.
const PUBLIC_BASE_URL =
  process.env.PUBLIC_BASE_URL ?? 'https://alarmmate-server-production.up.railway.app';
const DEFAULT_SOUNDS = [
  { name: '알람 시계', url: `${PUBLIC_BASE_URL}/public/sounds/default-alarm.wav` },
];

async function main(): Promise<void> {
  for (const sound of DEFAULT_SOUNDS) {
    const existing = await prisma.sound.findFirst({
      where: { name: sound.name, isDefault: true },
    });
    if (existing) {
      await prisma.sound.update({
        where: { id: existing.id },
        data: { url: sound.url },
      });
    } else {
      await prisma.sound.create({
        data: { name: sound.name, url: sound.url, isDefault: true },
      });
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
