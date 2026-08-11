import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { normalizeEmail } from '../common/utils/normalizers';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';

export type PublicUser = Omit<User, 'motDePasse'>;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async findAll(): Promise<User[]> {
    return this.usersRepository.find({ order: { nom: 'ASC' } });
  }

  async findOne(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`Utilisateur "${id}" introuvable.`);
    return user;
  }

  async findByEmailWithPassword(email: string): Promise<User | null> {
    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.motDePasse')
      .where('LOWER(user.email) = :email', { email: normalizeEmail(email) })
      .getOne();
  }

  async create(dto: CreateUserDto): Promise<PublicUser> {
    const email = normalizeEmail(dto.email);
    await this.assertEmailAvailable(email);

    const user = this.usersRepository.create({
      email,
      motDePasse: await bcrypt.hash(dto.password, 12),
      nom: dto.nom.trim(),
      role: dto.role,
      niveauTechnique: dto.niveauTechnique?.trim() ?? 'Intermediate',
      niveauMetier: dto.niveauMetier?.trim() ?? 'Intermediate',
    });

    const saved = await this.usersRepository.save(user);
    return this.toPublicUser(saved);
  }

  async update(id: string, dto: UpdateUserDto): Promise<PublicUser> {
    const user = await this.findOne(id);

    if (dto.email && normalizeEmail(dto.email) !== user.email) {
      const email = normalizeEmail(dto.email);
      await this.assertEmailAvailable(email, id);
      user.email = email;
    }

    if (dto.nom !== undefined) user.nom = dto.nom.trim();
    if (dto.role !== undefined) user.role = dto.role;
    if (dto.niveauTechnique !== undefined) user.niveauTechnique = dto.niveauTechnique.trim();
    if (dto.niveauMetier !== undefined) user.niveauMetier = dto.niveauMetier.trim();
    if (dto.actif !== undefined) user.actif = dto.actif;
    if (dto.password) user.motDePasse = await bcrypt.hash(dto.password, 12);

    const saved = await this.usersRepository.save(user);
    return this.toPublicUser(saved);
  }

  async remove(id: string): Promise<{ deactivated: true; id: string }> {
    const user = await this.findOne(id);
    user.actif = false;
    await this.usersRepository.save(user);
    return { deactivated: true, id };
  }


  private toPublicUser(user: User): PublicUser {
    const { motDePasse: _password, ...publicUser } = user;
    return publicUser as PublicUser;
  }

  private async assertEmailAvailable(email: string, excludeId?: string): Promise<void> {
    const qb = this.usersRepository
      .createQueryBuilder('user')
      .where('LOWER(user.email) = :email', { email });

    if (excludeId) qb.andWhere('user.id != :excludeId', { excludeId });

    if (await qb.getExists()) {
      throw new ConflictException(`L'adresse email "${email}" est déjà utilisée.`);
    }
  }
}
