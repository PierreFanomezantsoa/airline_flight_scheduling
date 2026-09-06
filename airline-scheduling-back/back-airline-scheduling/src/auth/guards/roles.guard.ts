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
  url?: string;
  method?: string;
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
    // REQUÊTE
    // =========================================================================

    const request =
      context
        .switchToHttp()
        .getRequest<RequestWithUser>();

    const user =
      request.user;

    // =========================================================================
    // DEBUG
    // =========================================================================

    console.log(
      '[RolesGuard]',
      {
        method:
          request.method,

        route:
          request.url,

        requiredRoles,

        userId:
          user?.id,

        userRole:
          user?.role,

        exp:
          user?.exp,
      },
    );

    // =========================================================================
    // UTILISATEUR ABSENT
    // =========================================================================

    if (
      !user
    ) {
      console.warn(
        '[RolesGuard] request.user est absent.',
      );

      throw new ForbiddenException(
        'Utilisateur authentifié introuvable dans la requête.',
      );
    }

    // =========================================================================
    // RÔLE ABSENT
    // =========================================================================

    if (
      !user.role
    ) {
      console.warn(
        '[RolesGuard] Rôle utilisateur absent.',
        {
          userId:
            user.id,
        },
      );

      throw new ForbiddenException(
        "Le rôle de l'utilisateur est introuvable dans la session.",
      );
    }

    // =========================================================================
    // VÉRIFICATION AUTORISATION
    // =========================================================================

    const isAuthorized =
      requiredRoles.includes(
        user.role,
      );

    if (
      !isAuthorized
    ) {
      console.warn(
        '[RolesGuard] Accès refusé.',
        {
          method:
            request.method,

          route:
            request.url,

          userId:
            user.id,

          userRole:
            user.role,

          requiredRoles,
        },
      );

      throw new ForbiddenException(
        `Le rôle "${user.role}" n'est pas autorisé à effectuer cette opération.`,
      );
    }

    // =========================================================================
    // ACCÈS AUTORISÉ
    // =========================================================================

    console.log(
      '[RolesGuard] Accès autorisé.',
      {
        method:
          request.method,

        route:
          request.url,

        userId:
          user.id,

        userRole:
          user.role,
      },
    );

    return true;
  }
}