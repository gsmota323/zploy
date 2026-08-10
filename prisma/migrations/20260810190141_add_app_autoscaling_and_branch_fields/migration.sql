-- AlterTable
ALTER TABLE "App" ADD COLUMN     "deploymentBranch" TEXT NOT NULL DEFAULT 'main',
ADD COLUMN     "maxReplicas" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "minReplicas" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "targetCPUUtilizationPercentage" INTEGER NOT NULL DEFAULT 70;
