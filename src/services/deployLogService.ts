import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type DeployLogType = "build" | "runtime";
type DeployLogLevel = "info" | "error";

type CreateDeployLogParams = {
  deployId: string;
  type?: DeployLogType;
  level?: DeployLogLevel;
  message: string;
};

export async function createDeployLog({
  deployId,
  type = "build",
  level = "info",
  message,
}: CreateDeployLogParams) {
  if (!message || !message.trim()) return;

  return prisma.deployLog.create({
    data: {
      deployId,
      type,
      level,
      message,
    },
  });
}

export async function getDeployLogs(deployId: string) {
  return prisma.deployLog.findMany({
    where: {
      deployId,
    },
    orderBy: {
      createdAt: "asc",
    },
  });
}