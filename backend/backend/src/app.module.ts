import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    MongooseModule.forRoot('mongodb://localhost:27017/rv-checklist', {
      // Use environment variables in production
      // uri: process.env.MONGODB_URI,
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
