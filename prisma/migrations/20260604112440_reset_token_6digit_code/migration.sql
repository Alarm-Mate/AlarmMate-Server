-- DropIndex
DROP INDEX "PasswordResetToken_token_key";

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_token_idx" ON "PasswordResetToken"("userId", "token");
