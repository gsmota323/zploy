import bcrypt from "bcrypt";
import prisma from "../config/prisma";

let cachedUserId: string | null = null;

export async function ensureStudyModeUserId() {
  if (cachedUserId) {
    return cachedUserId;
  }

  const email = process.env.LOCAL_DEV_EMAIL || "study@zploy.local";
  const username = process.env.LOCAL_DEV_USERNAME || "study";

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existingUser) {
    cachedUserId = existingUser.id;
    return cachedUserId;
  }

  const password = process.env.LOCAL_DEV_PASSWORD || "study123";
  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: { username },
    create: {
      email,
      username,
      password: hashedPassword,
    },
  });

  cachedUserId = user.id;
  return cachedUserId;
}

export function resetStudyModeUserCache() {
  cachedUserId = null;
}
