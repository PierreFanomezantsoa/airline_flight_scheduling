import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { SessionUser } from '../auth/interfaces/session-user.interface';

import { CreateUserDto } from './dto/create-user.dto';
import { RejectUserDto } from './dto/reject-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

import { UserRole } from './enums/user-role.enum';
import { UsersService } from './users.service';

interface AuthenticatedRequest {
  user: SessionUser;
}

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
  ) {}

  /**
   * Inscription publique.
   * Le service crée systématiquement le compte en PENDING.
   */
  @Post()
  create(
    @Body()
    dto: CreateUserDto,
  ) {
    return this.usersService.create(dto);
  }

  /**
   * Liste des membres d'équipage.
   *
   * Accessible aux profils OCC qui doivent affecter
   * un équipage à un vol.
   *
   * IMPORTANT :
   * cette route doit être placée avant @Get(':id').
   */
  @Get('crew-members')
  @UseGuards(
    SessionAuthGuard,
    RolesGuard,
  )
  @Roles(
    UserRole.ADMIN,
    UserRole.PLANIFICATEUR,
    UserRole.REGULATOR,
  )
  findCrewMembers() {
    return this.usersService.findCrewMembers();
  }

  /**
   * Tous les utilisateurs.
   * Réservé à l'administrateur.
   */
  @Get()
  @UseGuards(
    SessionAuthGuard,
    RolesGuard,
  )
  @Roles(
    UserRole.ADMIN,
  )
  findAll() {
    return this.usersService.findAll();
  }

  /**
   * Utilisateurs en attente.
   */
  @Get('pending')
  @UseGuards(
    SessionAuthGuard,
    RolesGuard,
  )
  @Roles(
    UserRole.ADMIN,
  )
  findPending() {
    return this.usersService.findPending();
  }

  /**
   * Utilisateurs approuvés.
   */
  @Get('approved')
  @UseGuards(
    SessionAuthGuard,
    RolesGuard,
  )
  @Roles(
    UserRole.ADMIN,
  )
  findApproved() {
    return this.usersService.findApproved();
  }

  /**
   * Utilisateurs rejetés.
   */
  @Get('rejected')
  @UseGuards(
    SessionAuthGuard,
    RolesGuard,
  )
  @Roles(
    UserRole.ADMIN,
  )
  findRejected() {
    return this.usersService.findRejected();
  }

  /**
   * Approuver un utilisateur.
   */
  @Patch(':id/approve')
  @UseGuards(
    SessionAuthGuard,
    RolesGuard,
  )
  @Roles(
    UserRole.ADMIN,
  )
  approveUser(
    @Param(
      'id',
      ParseUUIDPipe,
    )
    id: string,

    @Req()
    request: AuthenticatedRequest,
  ) {
    return this.usersService.approveUser(
      id,
      request.user.id,
    );
  }

  /**
   * Rejeter un utilisateur.
   */
  @Patch(':id/reject')
  @UseGuards(
    SessionAuthGuard,
    RolesGuard,
  )
  @Roles(
    UserRole.ADMIN,
  )
  rejectUser(
    @Param(
      'id',
      ParseUUIDPipe,
    )
    id: string,

    @Req()
    request: AuthenticatedRequest,

    @Body()
    dto: RejectUserDto,
  ) {
    return this.usersService.rejectUser(
      id,
      request.user.id,
      dto.reason,
    );
  }

  /**
   * Remettre un utilisateur en attente.
   */
  @Patch(':id/pending')
  @UseGuards(
    SessionAuthGuard,
    RolesGuard,
  )
  @Roles(
    UserRole.ADMIN,
  )
  setPending(
    @Param(
      'id',
      ParseUUIDPipe,
    )
    id: string,
  ) {
    return this.usersService.setPending(
      id,
    );
  }

  /**
   * Récupérer un utilisateur par ID.
   *
   * IMPORTANT :
   * laisser cette route après /crew-members,
   * /pending, /approved et /rejected.
   */
  @Get(':id')
  @UseGuards(
    SessionAuthGuard,
    RolesGuard,
  )
  @Roles(
    UserRole.ADMIN,
  )
  findOne(
    @Param(
      'id',
      ParseUUIDPipe,
    )
    id: string,
  ) {
    return this.usersService.findPublicOne(
      id,
    );
  }

  /**
   * Modifier un utilisateur.
   */
  @Patch(':id')
  @UseGuards(
    SessionAuthGuard,
    RolesGuard,
  )
  @Roles(
    UserRole.ADMIN,
  )
  update(
    @Param(
      'id',
      ParseUUIDPipe,
    )
    id: string,

    @Body()
    dto: UpdateUserDto,
  ) {
    return this.usersService.update(
      id,
      dto,
    );
  }

  /**
   * Supprimer un utilisateur.
   */
  @Delete(':id')
  @UseGuards(
    SessionAuthGuard,
    RolesGuard,
  )
  @Roles(
    UserRole.ADMIN,
  )
  remove(
    @Param(
      'id',
      ParseUUIDPipe,
    )
    id: string,
  ) {
    return this.usersService.remove(
      id,
    );
  }
}