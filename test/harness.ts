import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { OneSignalService } from '../src/common/services/onesignal.service';
import { PrismaService } from '../src/prisma/prisma.service';

export interface OneSignalMock {
  sendSilentPush: jest.Mock<Promise<void>, [string[], unknown]>;
}

export interface Harness {
  app: INestApplication;
  prisma: PrismaService;
  oneSignal: OneSignalMock;
}

export async function createHarness(): Promise<Harness> {
  const oneSignalMock: OneSignalMock = {
    sendSilentPush: jest.fn<Promise<void>, [string[], unknown]>(
      async () => undefined,
    ),
  };

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(OneSignalService)
    .useValue(oneSignalMock)
    .compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();

  const prisma = app.get(PrismaService);
  return { app, prisma, oneSignal: oneSignalMock };
}

export async function resetDb(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Notification", "WakeRecord", "GroupInvitation", "GroupMember", "Group", "Alarm", "Follow", "RefreshToken", "User" RESTART IDENTITY CASCADE',
  );
}

export async function closeHarness(h: Harness): Promise<void> {
  await h.app.close();
}

export function makePrismaClient(): PrismaClient {
  return new PrismaClient({
    datasources: {
      db: {
        url: 'postgresql://postgres:postgres@localhost:5434/alarmmate_test?schema=public',
      },
    },
  });
}
