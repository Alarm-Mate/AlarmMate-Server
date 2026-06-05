-- CreateEnum
CREATE TYPE "RingSessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'EXPIRED');

-- CreateTable
CREATE TABLE "GroupRingSession" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "status" "RingSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastRingAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "GroupRingSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GroupRingSession_status_idx" ON "GroupRingSession"("status");

-- CreateIndex
CREATE UNIQUE INDEX "GroupRingSession_groupId_date_key" ON "GroupRingSession"("groupId", "date");

-- AddForeignKey
ALTER TABLE "GroupRingSession" ADD CONSTRAINT "GroupRingSession_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
