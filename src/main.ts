import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Todas las rutas cuelgan de /v1 — versionado desde el dia 1 para que la API
  // sea estable y vendible a otras plataformas sin romper integraciones.
  app.setGlobalPrefix('v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  const port = process.env.PORT ? Number(process.env.PORT) : 4100;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Pegazo Fiscal API escuchando en http://localhost:${port}/v1`);
}
bootstrap();
