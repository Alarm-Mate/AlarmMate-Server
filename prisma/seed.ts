import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_SOUNDS = [
  { name: '알람 시계 1', url: 'https://cdn.alarmmate.app/sounds/default-1.mp3' },
  { name: '알람 시계 2', url: 'https://cdn.alarmmate.app/sounds/default-2.mp3' },
  { name: '알람 시계 3', url: 'https://cdn.alarmmate.app/sounds/default-3.mp3' },
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
