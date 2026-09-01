import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createHmac } from 'crypto';
import { UserAccountStatus } from '../users/enums/user-account-status.enum';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmailWithPassword(dto.email);

    if (!user) {
      throw new UnauthorizedException('Identifiants invalides.');
    }

    const valid = await bcrypt.compare(dto.password, user.motDePasse);
    if (!valid) {
      throw new UnauthorizedException('Identifiants invalides.');
    }

    if (!user.actif) {
      throw new ForbiddenException(
        'Votre compte est désactivé. Contactez un administrateur.',
      );
    }

    if (user.accountStatus === UserAccountStatus.PENDING) {
      throw new ForbiddenException(
        'Votre compte est en attente de validation par un administrateur.',
      );
    }

    if (user.accountStatus === UserAccountStatus.REJECTED) {
      throw new ForbiddenException(
        user.rejectionReason
          ? `Votre demande de compte a été refusée : ${user.rejectionReason}`
          : "Votre demande de compte a été refusée par l'administrateur.",
      );
    }

    if (user.accountStatus !== UserAccountStatus.APPROVED) {
      throw new ForbiddenException(
        "Votre compte n'est pas autorisé à accéder à l'application.",
      );
    }

    const { motDePasse: _password, ...publicUser } = user;

    return {
      user: publicUser,
      token: this.signSessionToken({
        sub: user.id,
        role: user.role,
        exp: Date.now() + 8 * 60 * 60 * 1000,
      }),
    };
  }

  private signSessionToken(payload: Record<string, unknown>): string {
    const secret = this.config.get<string>('AUTH_SECRET');
    if (!secret) {
      throw new Error('AUTH_SECRET doit être configuré dans .env.');
    }

    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', secret)
      .update(encoded)
      .digest('base64url');
    return `${encoded}.${signature}`;
  }
}
