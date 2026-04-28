import prisma from "../config/prisma";

export async function createUser(email: string, password: string) {
  return await prisma.user.create({
    data: {
      email,
      password
    }
  });
}

export async function getAllUsers() {
  return await prisma.user.findMany();
}