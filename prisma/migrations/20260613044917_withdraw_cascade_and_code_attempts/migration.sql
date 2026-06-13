-- DropForeignKey
ALTER TABLE "GroupInvitation" DROP CONSTRAINT "GroupInvitation_invitedById_fkey";

-- DropForeignKey
ALTER TABLE "GroupInvitation" DROP CONSTRAINT "GroupInvitation_userId_fkey";

-- AlterTable
ALTER TABLE "EmailVerification" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PasswordResetToken" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0;

-- AddForeignKey
ALTER TABLE "GroupInvitation" ADD CONSTRAINT "GroupInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupInvitation" ADD CONSTRAINT "GroupInvitation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
