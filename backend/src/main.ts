import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { requestContext } from './common/request-context';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use((req: any, _res: any, next: () => void) => {
    const forwarded = req.headers?.['x-forwarded-for'];
    const ip = (Array.isArray(forwarded) ? forwarded[0] : String(forwarded || '').split(',')[0]) || req.ip || req.socket?.remoteAddress || '';
    const userAgent = String(req.headers?.['user-agent'] || '').slice(0, 512);
    requestContext.run({ ip: String(ip).trim().slice(0, 64), userAgent }, () => next());
  });

  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') || true,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Vicit Llog API')
    .setDescription('Phase 1 – Visitor Access & Exit Control')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`Vicit Llog API running on http://localhost:${port}`);
  console.log(`Swagger docs: http://localhost:${port}/api`);
}

bootstrap();
