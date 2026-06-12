-- CreateTable
CREATE TABLE "DeployLog" (
    "id" TEXT NOT NULL,
    "deployId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'build',
    "level" TEXT NOT NULL DEFAULT 'info',
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeployLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeployLog_deployId_createdAt_idx" ON "DeployLog"("deployId", "createdAt");

-- AddForeignKey
ALTER TABLE "DeployLog" ADD CONSTRAINT "DeployLog_deployId_fkey" FOREIGN KEY ("deployId") REFERENCES "Deploy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
