// prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash('123456', 10);

  // O "upsert" tenta criar. Se o email já existir, ele não faz nada.
  const user = await prisma.user.upsert({
    where: { email: 'admin@tcc.com' },
    update: {},
    create: {
      email: 'admin@tcc.com',
      password: hashedPassword,
    },
  });

  console.log(`✅ Usuário fixo criado: ${user.email} | Senha: 123456`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });