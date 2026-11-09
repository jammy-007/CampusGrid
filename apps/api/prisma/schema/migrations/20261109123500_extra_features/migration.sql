-- CreateEnum
CREATE TYPE "AnnouncementPriority" AS ENUM ('INFO', 'IMPORTANT', 'URGENT');

-- AlterEnum
ALTER TYPE "RegistrationStatus" ADD VALUE 'WAITLISTED';

-- AlterTable
ALTER TABLE "Team" ADD COLUMN "isOpen" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "EventAnnouncement" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "priority" "AnnouncementPriority" NOT NULL DEFAULT 'INFO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventAnnouncement_eventId_createdAt_idx" ON "EventAnnouncement"("eventId", "createdAt");

-- AddForeignKey
ALTER TABLE "EventAnnouncement" ADD CONSTRAINT "EventAnnouncement_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAnnouncement" ADD CONSTRAINT "EventAnnouncement_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
