-- AlterEnum
ALTER TYPE "AlarmType" ADD VALUE 'APPOINTMENT';

-- AlterTable
ALTER TABLE "Alarm" ADD COLUMN     "appointmentTime" TEXT,
ADD COLUMN     "prepMinutes" INTEGER,
ADD COLUMN     "travelMinutes" INTEGER;
