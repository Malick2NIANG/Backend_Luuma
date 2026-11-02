/**
 * Amorçage du premier administrateur.
 *
 * Problème de l'œuf et la poule : les endpoints /api/admin exigent le rôle
 * ADMIN, mais rien ne permet de l'attribuer tant qu'aucun admin n'existe.
 * Ce script casse la boucle — il s'exécute avec les identifiants de la base,
 * ce qui est en soi le niveau de privilège requis pour un tel acte.
 *
 *   npm run admin:promote -- alice@luum.app
 *   npm run admin:promote -- alice@luum.app --revoke
 *
 * L'utilisateur doit déjà s'être inscrit via l'application.
 */
import 'dotenv/config';
import { PrismaClient, RoleType } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const email = args.find((a) => !a.startsWith('--'));
  const revoke = args.includes('--revoke');

  if (!email) {
    console.error('Usage : npm run admin:promote -- <email> [--revoke]');
    process.exitCode = 1;
    return;
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true },
  });

  if (!user) {
    console.error(
      `Aucun utilisateur avec l'email « ${email} ».\n` +
        "Inscrivez-vous d'abord dans l'application, puis relancez ce script.",
    );
    process.exitCode = 1;
    return;
  }

  if (revoke) {
    const { count } = await prisma.userRole.deleteMany({
      where: { userId: user.id, role: RoleType.ADMIN },
    });

    console.log(
      count > 0
        ? `Rôle ADMIN retiré à ${user.name} <${user.email}>.`
        : `${user.name} <${user.email}> n'était pas administrateur.`,
    );
    return;
  }

  // Upsert sur la contrainte @@unique([userId, role]) : relancer le script
  // ne crée pas de doublon.
  await prisma.userRole.upsert({
    where: { userId_role: { userId: user.id, role: RoleType.ADMIN } },
    update: {},
    create: { userId: user.id, role: RoleType.ADMIN },
  });

  const roles = await prisma.userRole.findMany({
    where: { userId: user.id },
    select: { role: true },
  });

  console.log(`${user.name} <${user.email}> est administrateur.`);
  console.log(`Rôles : ${roles.map((r) => r.role).join(', ')}`);
}

main()
  .catch((error: unknown) => {
    console.error('Échec :', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
