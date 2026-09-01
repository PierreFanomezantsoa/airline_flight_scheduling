import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { normalizeEmail } from '../common/utils/normalizers';
import { CreateUserDto, SELF_REGISTRATION_ROLES } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';
import { UserAccountStatus } from './enums/user-account-status.enum';
import { UserRole } from './enums/user-role.enum';

export type PublicUser = Omit<User, 'motDePasse'>;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async findAll(): Promise<PublicUser[]> {
    const users = await this.usersRepository.find({
      order: { creeA: 'DESC' },
    });
    return users.map((user) => this.toPublicUser(user));
  }

  async findPending(): Promise<PublicUser[]> {
    const users = await this.usersRepository.find({
      where: { accountStatus: UserAccountStatus.PENDING },
      order: { creeA: 'ASC' },
    });
    return users.map((user) => this.toPublicUser(user));
  }

  async findApproved(): Promise<PublicUser[]> {
    const users = await this.usersRepository.find({
      where: { accountStatus: UserAccountStatus.APPROVED },
      order: { creeA: 'DESC' },
    });
    return users.map((user) => this.toPublicUser(user));
  }

  async findRejected(): Promise<PublicUser[]> {
    const users = await this.usersRepository.find({
      where: { accountStatus: UserAccountStatus.REJECTED },
      order: { creeA: 'DESC' },
    });
    return users.map((user) => this.toPublicUser(user));
  }

  async findOne(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`Utilisateur "${id}" introuvable.`);
    }
    return user;
  }

  async findPublicOne(id: string): Promise<PublicUser> {
    return this.toPublicUser(await this.findOne(id));
  }

  async findByEmailWithPassword(email: string): Promise<User | null> {
    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.motDePasse')
      .where('LOWER(user.email) = :email', { email: normalizeEmail(email) })
      .getOne();
  }

  /**
   * Inscription publique : jamais d'Admin ni de Product Owner et toujours PENDING.
   */
  async create(dto: CreateUserDto): Promise<PublicUser> {
    if (!SELF_REGISTRATION_ROLES.includes(dto.role)) {
      throw new BadRequestException(
        "Ce rôle ne peut pas être demandé depuis l'inscription publique.",
      );
    }

    const email = normalizeEmail(dto.email);
    await this.assertEmailAvailable(email);

    const user = this.usersRepository.create({
      email,
      motDePasse: await bcrypt.hash(dto.password, 12),
      nom: dto.nom.trim(),
      role: dto.role,
      niveauTechnique: dto.niveauTechnique?.trim() ?? 'Intermediate',
      niveauMetier: dto.niveauMetier?.trim() ?? 'Intermediate',
      actif: true,
      accountStatus: UserAccountStatus.PENDING,
      approvedAt: null,
      approvedBy: null,
      rejectedAt: null,
      rejectedBy: null,
      rejectionReason: null,
    });

    const saved = await this.usersRepository.save(user);
    return this.toPublicUser(saved);
  }

  async approveUser(userId: string, adminId: string) {
    const user = await this.findOne(userId);

    if (user.role === UserRole.ADMIN) {
      throw new BadRequestException(
        "Un compte Admin ne peut pas être validé avec cette opération.",
      );
    }

    if (user.accountStatus === UserAccountStatus.APPROVED) {
      throw new BadRequestException('Ce compte est déjà validé.');
    }

    user.accountStatus = UserAccountStatus.APPROVED;
    user.actif = true;
    user.approvedAt = new Date();
    user.approvedBy = adminId;
    user.rejectedAt = null;
    user.rejectedBy = null;
    user.rejectionReason = null;

    const saved = await this.usersRepository.save(user);
    return {
      message: 'Compte utilisateur validé avec succès.',
      user: this.toPublicUser(saved),
    };
  }

  async rejectUser(userId: string, adminId: string, reason?: string) {
    const user = await this.findOne(userId);

    if (user.role === UserRole.ADMIN) {
      throw new BadRequestException(
        "Un compte Admin ne peut pas être refusé avec cette opération.",
      );
    }

    user.accountStatus = UserAccountStatus.REJECTED;
    user.approvedAt = null;
    user.approvedBy = null;
    user.rejectedAt = new Date();
    user.rejectedBy = adminId;
    user.rejectionReason = reason?.trim() || null;

    const saved = await this.usersRepository.save(user);
    return {
      message: 'Demande de compte refusée.',
      user: this.toPublicUser(saved),
    };
  }

  async setPending(userId: string) {
    const user = await this.findOne(userId);

    if (user.role === UserRole.ADMIN) {
      throw new BadRequestException(
        "Un compte Admin ne peut pas être remis en attente avec cette opération.",
      );
    }

    user.accountStatus = UserAccountStatus.PENDING;
    user.approvedAt = null;
    user.approvedBy = null;
    user.rejectedAt = null;
    user.rejectedBy = null;
    user.rejectionReason = null;

    const saved = await this.usersRepository.save(user);
    return {
      message: 'Compte remis en attente de validation.',
      user: this.toPublicUser(saved),
    };
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
    if (dto.niveauTechnique !== undefined) {
      user.niveauTechnique = dto.niveauTechnique.trim();
    }
    if (dto.niveauMetier !== undefined) {
      user.niveauMetier = dto.niveauMetier.trim();
    }
    if (dto.actif !== undefined) user.actif = dto.actif;
    if (dto.password) user.motDePasse = await bcrypt.hash(dto.password, 12);

    const saved = await this.usersRepository.save(user);
    return this.toPublicUser(saved);
  }

  /**
   * On conserve le comportement historique : DELETE désactive le compte.
   */
  async remove(id: string): Promise<{ deactivated: true; id: string }> {
    const user = await this.findOne(id);

    if (user.role === UserRole.ADMIN) {
      throw new BadRequestException(
        "Le compte Admin ne peut pas être désactivé via cette opération.",
      );
    }

    user.actif = false;
    await this.usersRepository.save(user);
    return { deactivated: true, id };
  }

  private toPublicUser(user: User): PublicUser {
    const { motDePasse: _password, ...publicUser } = user;
    return publicUser as PublicUser;
  }

  private async assertEmailAvailable(
    email: string,
    excludeId?: string,
  ): Promise<void> {
    const qb = this.usersRepository
      .createQueryBuilder('user')
      .where('LOWER(user.email) = :email', { email });

    if (excludeId) qb.andWhere('user.id != :excludeId', { excludeId });

    if (await qb.getExists()) {
      throw new ConflictException(
        `L'adresse email "${email}" est déjà utilisée.`,
      );
    }
  }
}
