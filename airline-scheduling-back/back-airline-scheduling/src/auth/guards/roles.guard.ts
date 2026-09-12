import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { Reflector } from '@nestjs/core';

import { UserRole } from '../../users/enums/user-role.enum';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { SessionUser } from '../interfaces/session-user.interface';

interface RequestWithUser {
  user?: SessionUser;
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
  ) {}

  canActivate(
    context: ExecutionContext,
  ): boolean {
    // =========================================================================
    // RÔLES AUTORISÉS POUR LA ROUTE
    // =========================================================================

    const requiredRoles =
      this.reflector.getAllAndOverride<UserRole[]>(
        ROLES_KEY,
        [
          context.getHandler(),
          context.getClass(),
        ],
      );

    // =========================================================================
    // AUCUN RÔLE REQUIS
    // =========================================================================

    if (
      !requiredRoles ||
      requiredRoles.length === 0
    ) {
      return true;
    }

    // =========================================================================
    // UTILISATEUR AUTHENTIFIÉ
    // =========================================================================

    const request =
      context
        .switchToHttp()
        .getRequest<RequestWithUser>();

    const user =
      request.user;

    // =========================================================================
    // UTILISATEUR ABSENT
    // =========================================================================

    if (!user) {
      throw new ForbiddenException(
        'Utilisateur authentifié introuvable dans la requête.',
      );
    }

    // =========================================================================
    // RÔLE ABSENT
    // =========================================================================

    if (!user.role) {
      throw new ForbiddenException(
        "Le rôle de l'utilisateur est introuvable dans la session.",
      );
    }

    // =========================================================================
    // VÉRIFICATION DES AUTORISATIONS
    // =========================================================================

    const isAuthorized =
      requiredRoles.includes(
        user.role,
      );

    if (!isAuthorized) {
      throw new ForbiddenException(
        `Le rôle "${user.role}" n'est pas autorisé à effectuer cette opération.`,
      );
    }

    // =========================================================================
    // ACCÈS AUTORISÉ
    // =========================================================================

    return true;
  }
}