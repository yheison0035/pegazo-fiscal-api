/**
 * Bootstrap: crea una Plataforma y su primera API key.
 *
 *   npx ts-node scripts/create-platform.ts "Pegazo CRM"
 *
 * Imprime la API key COMPLETA una sola vez. Guardala en el backend del CRM
 * (variable de entorno FISCAL_API_KEY). No se puede volver a ver.
 */
import { PrismaClient } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';

const prisma = new PrismaClient();

async function main() {
  const name = process.argv[2] || 'Pegazo CRM';
  const platform = await prisma.platform.create({ data: { name } });

  const prefixRnd = randomBytes(4).toString('hex');
  const secret = randomBytes(24).toString('hex');
  const prefix = `pgz_live_${prefixRnd}`;
  const fullKey = `${prefix}_${secret}`;

  await prisma.apiKey.create({
    data: {
      platformId: platform.id,
      label: 'default',
      prefix,
      hashedKey: createHash('sha256').update(secret).digest('hex'),
    },
  });

  console.log('\n  Plataforma creada:');
  console.log('    id   :', platform.id);
  console.log('    name :', platform.name);
  console.log('\n  API KEY (guardala ya, no se vuelve a mostrar):');
  console.log('   ', fullKey, '\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
