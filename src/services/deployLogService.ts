import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const deployIdsWithoutForeignKey = new Set<string>();

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

  if (deployIdsWithoutForeignKey.has(deployId)) {
    return;
  }

  try {
    return await prisma.deployLog.create({
      data: {
        deployId,
        type,
        level,
        message,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      // O deploy foi removido enquanto o worker ainda estava processando;
      // evita novas tentativas para esse mesmo deployId.
      deployIdsWithoutForeignKey.add(deployId);
      console.warn(
        `[DeployLog] Ignorando logs para deploy inexistente: ${deployId}`
      );
      return;
    }

    throw error;
  }
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