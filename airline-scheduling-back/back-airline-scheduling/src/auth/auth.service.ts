import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createHmac } from 'crypto';
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

    if (!user || !user.actif) {
      throw new UnauthorizedException('Identifiants invalides.');
    }

    const valid = await bcrypt.compare(dto.password, user.motDePasse);
    if (!valid) throw new UnauthorizedException('Identifiants invalides.');

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
    const signature = createHmac('sha256', secret).update(encoded).digest('base64url');
    return `${encoded}.${signature}`;
  }
}
