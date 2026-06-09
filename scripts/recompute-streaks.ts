/**
 * 모든 유저의 wakeStreak / totalWakeDays 를 실제 WakeRecord(날짜별) 기준으로 재계산한다.
 * - totalWakeDays = 기상한 서로 다른 KST 날짜 수
 * - wakeStreak    = 가장 최근 기상일에서 거꾸로 연속된 날짜 수(앱의 기상 시 로직과 동일)
 *
 * 과거에 "하루에 알람 2개 끄면 스트릭이 2씩 증가"하던 버그로 부풀려진 값을 바로잡는 일회성 보정.
 * 멱등(여러 번 돌려도 안전).
 *
 * 실행:
 *   - Railway(프로덕션):  railway run npx ts-node scripts/recompute-streaks.ts
 *   - 특정 DB 직접 지정:   DATABASE_URL="postgresql://..." npx ts-node scripts/recompute-streaks.ts
 *   - 미리보기(쓰기 안 함): DRY_RUN=1 ... (위 명령 앞에 DRY_RUN=1)
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DRY_RUN = process.env.DRY_RUN === '1';

// "yyyy-MM-dd" 의 전날.
function prevDate(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day));
  dt.setUTCDate(dt.getUTCDate() - 1);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

async function main(): Promise<void> {
  const users = await prisma.user.findMany({
    select: { id: true, nickname: true, wakeStreak: true, totalWakeDays: true },
  });

  let changed = 0;
  for (const u of users) {
    const recs = await prisma.wakeRecord.findMany({
      where: { userId: u.id },
      select: { date: true },
    });
    // 서로 다른 KST 날짜만(오름차순). "yyyy-MM-dd" 는 문자열 정렬 = 날짜 정렬.
    const dates = Array.from(new Set(recs.map((r) => r.date))).sort();
    const totalWakeDays = dates.length;

    let streak = 0;
    if (dates.length > 0) {
      streak = 1;
      for (let i = dates.length - 1; i > 0; i--) {
        if (dates[i - 1] === prevDate(dates[i])) streak++;
        else break;
      }
    }

    if (streak !== u.wakeStreak || totalWakeDays !== u.totalWakeDays) {
      console.log(
        `${u.nickname}: streak ${u.wakeStreak}→${streak}, totalDays ${u.totalWakeDays}→${totalWakeDays}`,
      );
      if (!DRY_RUN) {
        await prisma.user.update({
          where: { id: u.id },
          data: { wakeStreak: streak, totalWakeDays },
        });
      }
      changed++;
    }
  }

  console.log(
    `${DRY_RUN ? '[DRY_RUN] ' : ''}done. users=${users.length}, changed=${changed}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
