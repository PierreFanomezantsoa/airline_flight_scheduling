import { 
  Injectable, 
  NotFoundException, 
  ConflictException, 
  BadRequestException 
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CrewAssignment } from './entities/crew-assignment.entity';
import { Flight } from '../flights/entities/flight.entity';
import { User } from '../users/entities/user.entity';
import { CreateCrewAssignmentDto } from './dto/create-crew-assignment.dto';
import { UpdateCrewAssignmentDto } from './dto/update-crew-assignment.dto';

@Injectable()
export class CrewAssignmentsService {
  constructor(
    @InjectRepository(CrewAssignment)
    private readonly assignmentRepository: Repository<CrewAssignment>,
    @InjectRepository(Flight)
    private readonly flightRepository: Repository<Flight>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  // --- Créer une nouvelle affectation ---
  async create(createDto: CreateCrewAssignmentDto): Promise<CrewAssignment> {
    const { volId, utilisateurId, heuresReposAvant } = createDto;

    // 1. Vérifier l'existence du vol
    const vol = await this.flightRepository.findOne({ where: { id: volId } });
    if (!vol) {
      throw new NotFoundException(`Le vol avec l'ID "${volId}" n'a pas été trouvé.`);
    }

    // 2. Vérifier l'existence de l'utilisateur
    const utilisateur = await this.userRepository.findOne({ where: { id: utilisateurId } });
    if (!utilisateur) {
      throw new NotFoundException(`L'utilisateur avec l'ID "${utilisateurId}" n'a pas été trouvé.`);
    }

    // 3. Vérifier la contrainte d'unicité avant l'insertion
    const existingAssignment = await this.assignmentRepository.findOne({
      where: {
        vol: { id: volId },
        utilisateur: { id: utilisateurId },
      },
    });

    if (existingAssignment) {
      throw new ConflictException(
        `Cet utilisateur est déjà affecté à ce vol.`,
      );
    }

    // 4. Création et sauvegarde
    const assignment = this.assignmentRepository.create({
      vol,
      utilisateur,
      heuresReposAvant: heuresReposAvant ?? 0.0,
    });

    return await this.assignmentRepository.save(assignment);
  }

  // --- Récupérer toutes les affectations ---
  async findAll(): Promise<CrewAssignment[]> {
    return await this.assignmentRepository.find({
      relations: ['vol', 'utilisateur'],
    });
  }

  // --- Récupérer une affectation par ID ---
  async findOne(id: string): Promise<CrewAssignment> {
    const assignment = await this.assignmentRepository.findOne({
      where: { id },
      relations: ['vol', 'utilisateur'],
    });

    if (!assignment) {
      throw new NotFoundException(`Affectation avec l'ID "${id}" introuvable.`);
    }

    return assignment;
  }

  // --- Récupérer toutes les affectations d'un vol donné ---
  async findByVol(volId: string): Promise<CrewAssignment[]> {
    return await this.assignmentRepository.find({
      where: { vol: { id: volId } },
      relations: ['utilisateur'],
    });
  }

  // --- Récupérer les vols affectés à un membre d'équipage ---
  async findByUtilisateur(utilisateurId: string): Promise<CrewAssignment[]> {
    return await this.assignmentRepository.find({
      where: { utilisateur: { id: utilisateurId } },
      relations: ['vol'],
    });
  }

  // --- Mettre à jour une affectation ---
  async update(id: string, updateDto: UpdateCrewAssignmentDto): Promise<CrewAssignment> {
    const assignment = await this.findOne(id);

    if (updateDto.volId) {
      const vol = await this.flightRepository.findOne({ where: { id: updateDto.volId } });
      if (!vol) throw new NotFoundException(`Vol introuvable.`);
      assignment.vol = vol;
    }

    if (updateDto.utilisateurId) {
      const utilisateur = await this.userRepository.findOne({ where: { id: updateDto.utilisateurId } });
      if (!utilisateur) throw new NotFoundException(`Utilisateur introuvable.`);
      assignment.utilisateur = utilisateur;
    }

    if (updateDto.heuresReposAvant !== undefined) {
      assignment.heuresReposAvant = updateDto.heuresReposAvant;
    }

    try {
      return await this.assignmentRepository.save(assignment);
    } catch (error: any) {
      // Gestion si la modification crée un doublon d'unicité
      if (error.code === '23505') {
        throw new ConflictException(`L'utilisateur est déjà affecté à ce vol.`);
      }
      throw new BadRequestException(`Erreur lors de la mise à jour de l'affectation.`);
    }
  }

  // --- Supprimer / Désaffecter un membre du vol ---
  async remove(id: string): Promise<{ message: string }> {
    const assignment = await this.findOne(id);
    await this.assignmentRepository.remove(assignment);
    return { message: `L'affectation "${id}" a été supprimée avec succès.` };
  }
}