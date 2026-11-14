-- RF-15: el recordatorio del próximo control queda enlazado al seguimiento que lo originó.

-- AlterTable
ALTER TABLE "reminders" ADD COLUMN "follow_up_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "reminders_follow_up_id_key" ON "reminders"("follow_up_id");

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_follow_up_id_fkey" FOREIGN KEY ("follow_up_id") REFERENCES "follow_ups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
