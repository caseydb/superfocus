/*
  Warnings:

  - You are about to drop the column `createdAt` on the `task` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `task` table. All the data in the column will be lost.
  - You are about to drop the column `authId` on the `user` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `user` table. All the data in the column will be lost.
  - You are about to drop the column `firstName` on the `user` table. All the data in the column will be lost.
  - You are about to drop the column `lastActive` on the `user` table. All the data in the column will be lost.
  - You are about to drop the column `lastName` on the `user` table. All the data in the column will be lost.
  - You are about to drop the column `profileImage` on the `user` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[auth_id]` on the table `user` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `updated_at` to the `task` table without a default value. This is not possible if the table is not empty.
  - Added the required column `user_id` to the `task` table without a default value. This is not possible if the table is not empty.
  - Added the required column `auth_id` to the `user` table without a default value. This is not possible if the table is not empty.
  - Added the required column `first_name` to the `user` table without a default value. This is not possible if the table is not empty.
  - Added the required column `last_active` to the `user` table without a default value. This is not possible if the table is not empty.
  - Added the required column `last_name` to the `user` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "task" DROP CONSTRAINT "task_userId_fkey";

-- DropIndex
DROP INDEX "user_authId_key";

-- AlterTable
ALTER TABLE "task" DROP COLUMN "createdAt",
DROP COLUMN "userId",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "total_time" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "user_id" TEXT NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'not_started';

-- AlterTable
ALTER TABLE "user" DROP COLUMN "authId",
DROP COLUMN "createdAt",
DROP COLUMN "firstName",
DROP COLUMN "lastActive",
DROP COLUMN "lastName",
DROP COLUMN "profileImage",
ADD COLUMN     "auth_id" TEXT NOT NULL,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "current_task_id" TEXT,
ADD COLUMN     "first_name" TEXT NOT NULL,
ADD COLUMN     "last_active" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "last_name" TEXT NOT NULL,
ADD COLUMN     "profile_image" TEXT;

-- CreateTable
CREATE TABLE "preference" (
    "user_id" TEXT NOT NULL,
    "toggle_notes" BOOLEAN NOT NULL DEFAULT true,
    "toggle_pomodoro" BOOLEAN NOT NULL DEFAULT true,
    "toggle_pomodoro_overtime" BOOLEAN NOT NULL DEFAULT false,
    "sound_volume" INTEGER NOT NULL DEFAULT 50,
    "task_selection_mode" TEXT NOT NULL DEFAULT 'sidebar',
    "focus_check_time" INTEGER NOT NULL DEFAULT 15,
    "local_time" TEXT NOT NULL,

    CONSTRAINT "preference_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "note" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content_text" TEXT NOT NULL,
    "checklist_completed" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,

    CONSTRAINT "note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_history" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "task_name" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "completed" BOOLEAN NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timer_session" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "duration" INTEGER NOT NULL DEFAULT 0,
    "is_running" BOOLEAN NOT NULL DEFAULT true,
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "overdue" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "timer_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_streak" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "completion_date" TIMESTAMP(3) NOT NULL,
    "tasks_completed" INTEGER NOT NULL,
    "total_seconds" INTEGER NOT NULL,

    CONSTRAINT "daily_streak_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_setting" (
    "room_id" TEXT NOT NULL,
    "toggle_leaderboard" BOOLEAN NOT NULL DEFAULT true,
    "toggle_streaks" BOOLEAN NOT NULL DEFAULT true,
    "toggle_tooltip_stats" BOOLEAN NOT NULL DEFAULT true,
    "authentication_required" BOOLEAN NOT NULL DEFAULT false,
    "sprint_duration" TEXT NOT NULL DEFAULT '1_week',
    "room_timezone" TEXT NOT NULL,

    CONSTRAINT "admin_setting_pkey" PRIMARY KEY ("room_id")
);

-- CreateTable
CREATE TABLE "room" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "picture" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "owner" TEXT NOT NULL,

    CONSTRAINT "room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_member" (
    "id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joined" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flying_message" (
    "id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "flying_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sound_cooldown" (
    "id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "sound_type" TEXT NOT NULL,
    "last_played" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sound_cooldown_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "room_slug_key" ON "room"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "user_auth_id_key" ON "user"("auth_id");

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_current_task_id_fkey" FOREIGN KEY ("current_task_id") REFERENCES "task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preference" ADD CONSTRAINT "preference_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note" ADD CONSTRAINT "note_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_history" ADD CONSTRAINT "task_history_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_history" ADD CONSTRAINT "task_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_history" ADD CONSTRAINT "task_history_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timer_session" ADD CONSTRAINT "timer_session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timer_session" ADD CONSTRAINT "timer_session_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timer_session" ADD CONSTRAINT "timer_session_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_streak" ADD CONSTRAINT "daily_streak_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_setting" ADD CONSTRAINT "admin_setting_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_member" ADD CONSTRAINT "room_member_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_member" ADD CONSTRAINT "room_member_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flying_message" ADD CONSTRAINT "flying_message_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flying_message" ADD CONSTRAINT "flying_message_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sound_cooldown" ADD CONSTRAINT "sound_cooldown_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sound_cooldown" ADD CONSTRAINT "sound_cooldown_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
