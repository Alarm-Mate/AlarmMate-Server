-- WakeRecord: 날짜별 1건으로 변경(과거 기상 이력 보존) + 알람 삭제 시 cascade.

-- 1) date 컬럼 추가(우선 nullable)
ALTER TABLE "WakeRecord" ADD COLUMN "date" TEXT;

-- 2) 기존 행 백필: wokeAt(UTC) → KST 날짜 문자열
UPDATE "WakeRecord"
SET "date" = to_char((("wokeAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Seoul'), 'YYYY-MM-DD')
WHERE "date" IS NULL;

-- 3) NOT NULL 적용
ALTER TABLE "WakeRecord" ALTER COLUMN "date" SET NOT NULL;

-- 4) unique 제약 교체: (userId, alarmId) → (userId, alarmId, date)
DROP INDEX "WakeRecord_userId_alarmId_key";
CREATE UNIQUE INDEX "WakeRecord_userId_alarmId_date_key" ON "WakeRecord"("userId", "alarmId", "date");

-- 5) alarm 관계에 ON DELETE CASCADE 추가(알람 삭제/그룹 정리 시 FK 위반 방지)
ALTER TABLE "WakeRecord" DROP CONSTRAINT "WakeRecord_alarmId_fkey";
ALTER TABLE "WakeRecord" ADD CONSTRAINT "WakeRecord_alarmId_fkey"
  FOREIGN KEY ("alarmId") REFERENCES "Alarm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
