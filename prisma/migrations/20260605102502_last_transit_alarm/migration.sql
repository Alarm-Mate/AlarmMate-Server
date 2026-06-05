-- AlterEnum
ALTER TYPE "AlarmType" ADD VALUE 'LAST_TRANSIT';

-- AlterTable
ALTER TABLE "Alarm" ADD COLUMN     "boardingStopName" TEXT,
ADD COLUMN     "destLat" DOUBLE PRECISION,
ADD COLUMN     "destLng" DOUBLE PRECISION,
ADD COLUMN     "destName" TEXT,
ADD COLUMN     "lastDeparture" TEXT,
ADD COLUMN     "originLat" DOUBLE PRECISION,
ADD COLUMN     "originLng" DOUBLE PRECISION,
ADD COLUMN     "originName" TEXT,
ADD COLUMN     "walkMinutes" INTEGER;
