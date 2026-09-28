import { applyDecorators, UseGuards } from '@nestjs/common';
import { UserRole } from '../../users/enums/user-role.enum';
import { Roles } from './roles.decorator';
import { RolesGuard } from '../guards/roles.guard';
import { SessionAuthGuard } from '../guards/session-auth.guard';

export function AuthenticatedRoles(...roles: UserRole[]) {
  return applyDecorators(
    UseGuards(SessionAuthGuard, RolesGuard),
    Roles(...roles),
  );
}