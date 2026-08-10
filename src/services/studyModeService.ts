import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function ensureStudyModeUserId() {
  const email = process.env.LOCAL_DEV_EMAIL || "study@zploy.local";
  const username = process.env.LOCAL_DEV_USERNAME || "study";
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

  return user.id;
}
