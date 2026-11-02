import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { buildCorsOptions } from './common/cors';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // REST routes get the /api prefix (e.g. /trips -> /api/trips), but
  // AuthController already declares its own 'api/auth' controller path, so
  // it must be excluded here to avoid becoming /api/api/auth/*.
  app.setGlobalPrefix('api', {
    exclude: [{ path: 'api/auth/(.*)', method: RequestMethod.ALL }],
  });

  app.enableCors(buildCorsOptions(configService.get<string>('NODE_ENV')));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  app.useWebSocketAdapter(new IoAdapter(app));

  if (configService.get('NODE_ENV') !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Luuma API')
      .setDescription('Luuma - API Backend documentation')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  const port = configService.get<number>('PORT') ?? 3000;
  await app.listen(port);
}

bootstrap();
