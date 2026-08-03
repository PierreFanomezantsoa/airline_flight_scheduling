import { Controller, Get, Post, Patch, Delete, Body, Param, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
import * as bcrypt from 'bcrypt';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ==========================================
  // NOUVEAU ENDPOINT : Connexion (Login)
  // URL Cible : POST http://localhost:3001/users/login
  // ==========================================
@Post('login')
  async login(@Body() loginDto: LoginUserDto) {
    const { email, password, role } = loginDto;

    // 1. Rechercher l'utilisateur via le service
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Identifiants incorrects (Email introuvable).');
    }

    // 2. Comparer le mot de passe reçu avec le mot de passe hache en BDD (CORRECTION ICI)
    const isPasswordValid = await bcrypt.compare(password, user.motDePasse || '');
    if (!isPasswordValid) {
      throw new UnauthorizedException('Identifiants incorrects (Mot de passe invalide).');
    }

    // 3. Verifier le role si fourni par le front-end
    if (role && user.role !== role) {
      throw new UnauthorizedException('Role incorrect pour cet utilisateur.');
    }

    // 4. Nettoyer l'objet (CORRECTION ICI)
    const { motDePasse: _, ...userWithoutPassword } = user;

    // 5. Retourner la structure attendue par le Front-end
    return {
      user: userWithoutPassword,
      token: 'jwt-airline-suite-session-token',
    };
  }

  // ==========================================
  // Endpoints existants inchangés
  // ==========================================
  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const user = await this.usersService.findOne(id);
    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }
    return user;
  }

  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}