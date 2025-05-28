import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { SeedService } from './seed/seed.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  
  // Enable CORS for frontend
  app.enableCors({
    origin: configService.get('CORS_ORIGIN') || 'http://localhost:4200',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });
  
  // API global prefix
  app.setGlobalPrefix('api');
  
  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  
  // Run seed service if AUTO_SEED is enabled
  if (configService.get('AUTO_SEED') === 'true') {
    const seedService = app.get(SeedService);
    try {
      await seedService.seed();
      console.log('Auto-seeding completed successfully');
    } catch (error) {
      console.error('Auto-seeding failed:', error.message);
    }
  }
  
  const port = configService.get('PORT') || 3000;
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}/api`);
}

bootstrap();
