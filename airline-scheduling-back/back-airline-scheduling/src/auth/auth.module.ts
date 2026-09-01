import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RolesGuard } from './guards/roles.guard';
import { SessionAuthGuard } from './guards/session-auth.guard';

@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [AuthService, SessionAuthGuard, RolesGuard],
  exports: [SessionAuthGuard, RolesGuard],
})
export class AuthModule {}
