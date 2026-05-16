-- CreateEnum
CREATE TYPE "EducationType" AS ENUM ('GENERAL', 'OPEN');

-- CreateEnum
CREATE TYPE "FileType" AS ENUM ('SUMMARY', 'BANK', 'GOLDEN', 'COURSES', 'RECORDINGS');

-- AlterTable
ALTER TABLE "Course" ALTER COLUMN "fileId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "CourseFile" (
    "id" SERIAL NOT NULL,
    "fileId" TEXT NOT NULL,
    "name" TEXT,
    "fileType" "FileType" NOT NULL DEFAULT 'SUMMARY',
    "educationType" "EducationType" NOT NULL DEFAULT 'GENERAL',
    "courseId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourseFile_courseId_idx" ON "CourseFile"("courseId");

-- CreateIndex
CREATE INDEX "CourseFile_courseId_educationType_fileType_idx" ON "CourseFile"("courseId", "educationType", "fileType");

-- AddForeignKey
ALTER TABLE "CourseFile" ADD CONSTRAINT "CourseFile_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
