import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  // Récupérer tous les utilisateurs
  findAll() {
    return this.usersRepository.find();
  }

  // Trouver un utilisateur par son ID
  findOne(id: string) {
    return this.usersRepository.findOne({ where: { id } });
  }

  // Trouver un utilisateur par son email (utilisé pour l'authentification)
  findByEmail(email: string) {
    return this.usersRepository.findOne({ where: { email } });
  }

  // Création d'un nouvel utilisateur (Inscription / Sign-Up)
  async create(createUserDto: CreateUserDto) {
    const { email, password, ...leReste } = createUserDto;

    // Vérifier si l'adresse email est déjà prise
    const existingUser = await this.findByEmail(email);
    if (existingUser) {
      throw new ConflictException(`L'utilisateur avec l'email ${email} existe déjà.`);
    }

    // Hachage sécurisé du mot de passe avec bcrypt
    const saltOrRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltOrRounds);

    // Création de l'entité TypeORM avec les champs francisés requis
    const user = this.usersRepository.create({
      ...leReste, // Contient déjà la propriété 'nom' et 'role' validées par le DTO
      email,
      motDePasse: hashedPassword,
    });
    
    return this.usersRepository.save(user);
  }

  // Mise à jour des informations d'un utilisateur
  async update(id: string, updateUserDto: UpdateUserDto) {
    const user = await this.findOne(id);
    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    // Extraction du mot de passe pour traitement isolé
    const { password, ...donneesModification } = updateUserDto;
    const modificationsPlates: any = { ...donneesModification };

    // Si un nouveau mot de passe est fourni, on le hache avant stockage
    if (password) {
      const saltOrRounds = 10;
      modificationsPlates.motDePasse = await bcrypt.hash(password, saltOrRounds);
    }

    // Application des modifications sur l'entité existante
    Object.assign(user, modificationsPlates);
    return this.usersRepository.save(user);
  }

  // Suppression d'un utilisateur
  async remove(id: string) {
    const user = await this.findOne(id);
    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }
    await this.usersRepository.remove(user);
    return { deleted: true };
  }
}