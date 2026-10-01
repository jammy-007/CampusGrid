-- System messages ("Priya joined the team") have no sender.
-- AlterTable
ALTER TABLE "ChatMessage" ALTER COLUMN "senderId" DROP NOT NULL;
