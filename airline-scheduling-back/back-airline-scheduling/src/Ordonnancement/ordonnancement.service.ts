import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { LigneProduction } from '../Ordonnancement/entities/ligne-production.entity';
import { TacheProduction, StatutTache } from './entities/tache-production.entity';
import { CreneauOrdonnance } from './entities/creneau-ordonnance.entity';
import { CreerLigneDto, AssignerTacheDto, DeplacerCreneauDto } from './dto/ordonnancement.dto';

@Injectable()
export class OrdonnancementService {
  constructor(
    @InjectRepository(LigneProduction)
    private readonly ligneRepo: Repository<LigneProduction>,
    @InjectRepository(TacheProduction)
    private readonly tacheRepo: Repository<TacheProduction>,
    @InjectRepository(CreneauOrdonnance)
    private readonly creneauRepo: Repository<CreneauOrdonnance>,
  ) {}

  // Créer une nouvelle ligne physique
  async creerLigne(dto: CreerLigneDto): Promise<LigneProduction> {
    const ligneExiste = await this.ligneRepo.findOne({ where: { code: dto.code } });
    if (ligneExiste) {
      throw new BadRequestException(`Une ligne avec le code "${dto.code}" existe déjà.`);
    }
    const nouvelleLigne = this.ligneRepo.create(dto);
    return this.ligneRepo.save(nouvelleLigne);
  }

  // Liste des lignes de production
  async obtenirLignes(): Promise<LigneProduction[]> {
    return this.ligneRepo.find({ order: { nom: 'ASC' } });
  }

  // Obtenir le backlog réel depuis la BDD
  async obtenirTachesEnAttente(): Promise<TacheProduction[]> {
    return await this.tacheRepo.find({
      where: { statut: StatutTache.EN_ATTENTE },
      order: { id: 'ASC' }
    });
  }

  // Obtenir le planning du calendrier pour une période donnée
  async obtenirCalendrier(debut: Date, fin: Date): Promise<CreneauOrdonnance[]> {
    return this.creneauRepo.find({
      where: [
        { dateDebut: Between(debut, fin) },
        { dateFin: Between(debut, fin) },
      ],
      relations: ['ligne', 'tache'],
      order: { dateDebut: 'ASC' },
    });
  }

  // Assigner une tâche avec algorithme anti-chevauchement strict
  async assignerTache(dto: AssignerTacheDto): Promise<CreneauOrdonnance> {
    const ligne = await this.ligneRepo.findOne({ where: { id: dto.ligneId, estActif: true } });
    if (!ligne) throw new NotFoundException('Ligne de production introuvable ou inactive.');

    const tache = await this.tacheRepo.findOne({ where: { id: dto.tacheId } });
    if (!tache) throw new NotFoundException('Tâche de production introuvable.');

    if (tache.statut === StatutTache.PLANIFIE) {
      throw new BadRequestException('Cette tâche est déjà planifiée sur une autre ligne.');
    }

    const dateDebut = new Date(dto.dateDebut);
    const dateFin = new Date(dto.dateFin);

    if (dateDebut >= dateFin) {
      throw new BadRequestException('La date de début doit être antérieure à la date de fin.');
    }

    const chevauchement = await this.verifierChevauchement(ligne.id, dateDebut, dateFin);
    if (chevauchement) {
      throw new BadRequestException('La ligne de production est déjà occupée sur cette plage horaire.');
    }

    const creneau = this.creneauRepo.create({ ligne, tache, dateDebut, dateFin });
    tache.statut = StatutTache.PLANIFIE;
    await this.tacheRepo.save(tache);

    return this.creneauRepo.save(creneau);
  }

  // Déplacer / Modifier les coordonnées temporelles du créneau
  async deplacerCreneau(id: number, dto: DeplacerCreneauDto): Promise<CreneauOrdonnance> {
    const creneau = await this.creneauRepo.findOne({ where: { id }, relations: ['ligne', 'tache'] });
    if (!creneau) throw new NotFoundException("Créneau d'ordonnancement introuvable.");

    const dateDebut = new Date(dto.dateDebut);
    const dateFin = new Date(dto.dateFin);

    if (dateDebut >= dateFin) {
      throw new BadRequestException('La date de début doit être antérieure à la date de fin.');
    }

    let cibleLigneId = creneau.ligne.id;
    if (dto.ligneId && dto.ligneId !== creneau.ligne.id) {
      const nouvelleLigne = await this.ligneRepo.findOne({ where: { id: dto.ligneId, estActif: true } });
      if (!nouvelleLigne) throw new NotFoundException('La nouvelle ligne cible est introuvable ou inactive.');
      creneau.ligne = nouvelleLigne;
      cibleLigneId = nouvelleLigne.id;
    }

    const chevauchement = await this.verifierChevauchement(cibleLigneId, dateDebut, dateFin, creneau.id);
    if (chevauchement) {
      throw new BadRequestException('Impossible de déplacer : conflit de chevauchement sur la ligne cible.');
    }

    creneau.dateDebut = dateDebut;
    creneau.dateFin = dateFin;

    return this.creneauRepo.save(creneau);
  }

  // Retirer de la planification (Désordonnancer)
  async retirerPlanification(id: number): Promise<{ message: string }> {
    const creneau = await this.creneauRepo.findOne({ where: { id }, relations: ['tache'] });
    if (!creneau) throw new NotFoundException("Créneau d'ordonnancement introuvable.");

    if (creneau.tache) {
      creneau.tache.statut = StatutTache.EN_ATTENTE;
      await this.tacheRepo.save(creneau.tache);
    }

    await this.creneauRepo.remove(creneau);
    return { message: 'Planification annulée. Tâche renvoyée au backlog.' };
  }

  // Moteur SQL Anti-chevauchement
  private async verifierChevauchement(
    ligneId: number,
    debut: Date,
    fin: Date,
    exclureCreneauId?: number,
  ): Promise<boolean> {
    const requeteIntersection = this.creneauRepo
      .createQueryBuilder('creneau')
      .where('creneau.ligneId = :ligneId', { ligneId })
      .andWhere('creneau.dateDebut < :fin', { fin })
      .andWhere('creneau.dateFin > :debut', { debut });

    if (exclureCreneauId) {
      requeteIntersection.andWhere('creneau.id != :exclureCreneauId', { exclureCreneauId });
    }

    const conflit = await requeteIntersection.getOne();
    return !!conflit;
  }
}