-- DropForeignKey
ALTER TABLE "WakeRecord" DROP CONSTRAINT "WakeRecord_alarmId_fkey";

-- AlterTable
ALTER TABLE "WakeRecord" ALTER COLUMN "alarmId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "WakeRecord" ADD CONSTRAINT "WakeRecord_alarmId_fkey" FOREIGN KEY ("alarmId") REFERENCES "Alarm"("id") ON DELETE SET NULL ON UPDATE CASCADE;
