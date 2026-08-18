import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SessionController } from './session.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [SessionController],
})
export class SessionModule {}
