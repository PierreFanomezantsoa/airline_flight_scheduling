import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('auth/login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  /** Compatibilité avec l'ancien frontend. */
  @Post('users/login')
  legacyLogin(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}
