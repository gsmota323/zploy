import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";
import * as jwt from "jsonwebtoken";

const prisma = new PrismaClient();

export async function authenticateUser(identifier: string, password: string) {
  const login = identifier.trim();
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: { equals: login, mode: "insensitive" } },
        { username: { equals: login, mode: "insensitive" } },
      ],
    },
  });

  if (!user) {
    return null;
  }

  const passwordMatches = await bcrypt.compare(password, user.password);

  if (!passwordMatches) {
    return null;
  }

  const token = jwt.sign(
    {
      userId: user.id,
      email: user.email,
      username: user.username,
    },
    process.env.JWT_SECRET as string,
    {
      expiresIn: "1d",
    }
  );

  return token;
}