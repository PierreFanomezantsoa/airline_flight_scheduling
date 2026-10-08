import { MigrationInterface, QueryRunner } from 'typeorm';
import { reconcileEntityEnumTypes } from './helpers/entity-enum-reconciliation';

const columnRenames: Record<string, [string, string][]> = {
  airports: [['iata', 'ref_airport']],
  users: [
    ['id', 'ref_user'],
    ['motDePasse', 'passwordHash'],
    ['nom', 'name'],
    ['niveauTechnique', 'technicalLevel'],
    ['niveauMetier', 'professionalLevel'],
    ['actif', 'isActive'],
    ['approvedBy', 'ref_user_approver'],
    ['rejectedBy', 'ref_user_rejector'],
    ['creeA', 'createdAt'],
    ['misAJourA', 'updatedAt'],
  ],
  flights: [
    ['id', 'ref_flight'],
    ['numeroVol', 'flightNumber'],
    ['aeroportDepart', 'departureAirportCode'],
    ['aeroportEscale', 'stopoverAirportCodes'],
    ['dureeEscale', 'stopoverDurationMinutes'],
    ['aeroportArrivee', 'arrivalAirportCode'],
    ['heureDepart', 'departureTime'],
    ['heureArrivee', 'arrivalTime'],
    ['statut', 'status'],
    ['avionId', 'ref_aircraft'],
    ['heuresComptabilisees', 'flightHoursRecorded'],
    ['heuresCreditees', 'creditedFlightHours'],
    ['heuresComptabiliseesAt', 'flightHoursRecordedAt'],
    ['creeA', 'createdAt'],
    ['misAJourA', 'updatedAt'],
    ['supprimeA', 'deletedAt'],
  ],
  aircrafts: [
    ['id', 'ref_aircraft'],
    ['immatriculation', 'registration'],
    ['modele', 'model'],
    ['capacite', 'capacity'],
    ['heuresDeVolTotales', 'totalFlightHours'],
    ['limiteHeuresMaintenance', 'maintenanceHoursLimit'],
    ['heuresDepuisDerniereMaintenance', 'hoursSinceMaintenance'],
    ['dateDerniereMaintenance', 'lastMaintenanceAt'],
    ['statut', 'status'],
    ['baseAttache', 'homeBase'],
    ['typeId', 'ref_aircraft_type'],
    ['creeA', 'createdAt'],
    ['misAJourA', 'updatedAt'],
  ],
  aircraft_types: [
    ['id', 'ref_aircraft_type'],
    ['nomModele', 'modelName'],
    ['fabricant', 'manufacturer'],
    ['capaciteMax', 'maxCapacity'],
    ['vitesseCroisiere', 'cruiseSpeed'],
    ['autonomieMax', 'maxRange'],
    ['consommationCarburant', 'fuelConsumption'],
    ['intervalleMaintenanceHeures', 'maintenanceIntervalHours'],
    ['creeA', 'createdAt'],
    ['misAJourA', 'updatedAt'],
  ],
  maintenance_slots: [
    ['id', 'ref_maintenance_slot'],
    ['aircraftId', 'ref_aircraft'],
    ['creeA', 'createdAt'],
    ['misAJourA', 'updatedAt'],
  ],
  crew_assignments: [
    ['id', 'ref_crew_assignment'],
    ['volId', 'ref_flight'],
    ['utilisateurId', 'ref_user'],
    ['fonction', 'crewRole'],
    ['heuresReposAvant', 'priorRestHours'],
  ],
  network_configuration: [['id', 'ref_network_configuration']],
};

const quoteIdentifier = (identifier: string): string =>
  `"${identifier.replace(/"/g, '""')}"`;

export class RenameEntityColumns20261008120000
  implements MigrationInterface
{
  name = 'RenameEntityColumns20261008120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.renameColumns(queryRunner, false);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.renameColumns(queryRunner, true);
  }

  private async renameColumns(
    queryRunner: QueryRunner,
    reverse: boolean,
  ): Promise<void> {
    const tables = Object.entries(columnRenames);

    for (const [tableName, renames] of reverse ? tables.reverse() : tables) {
      if (!(await queryRunner.hasTable(tableName))) {
        continue;
      }

      const orderedRenames = reverse ? [...renames].reverse() : renames;
      for (const [oldName, newName] of orderedRenames) {
        const [from, to] = reverse
          ? [newName, oldName]
          : [oldName, newName];

        if (
          (await queryRunner.hasColumn(tableName, from)) &&
          !(await queryRunner.hasColumn(tableName, to))
        ) {
          await queryRunner.query(
            `ALTER TABLE ${quoteIdentifier(tableName)} RENAME COLUMN ${quoteIdentifier(from)} TO ${quoteIdentifier(to)}`,
          );
        } else if (
          (await queryRunner.hasColumn(tableName, from)) &&
          (await queryRunner.hasColumn(tableName, to))
        ) {
          const [column] = await queryRunner.query(
            `
              SELECT format_type(attribute.atttypid, attribute.atttypmod) AS "targetType"
              FROM pg_attribute AS attribute
              WHERE attribute.attrelid = to_regclass($1)
                AND attribute.attname = $2
                AND attribute.attnum > 0
                AND NOT attribute.attisdropped
            `,
            [tableName, to],
          );

          if (!column?.targetType) {
            throw new Error(
              `Unable to determine the database type for ${tableName}.${to}`,
            );
          }

          await queryRunner.query(
            `UPDATE ${quoteIdentifier(tableName)} SET ${quoteIdentifier(to)} = ${quoteIdentifier(from)}::text::${column.targetType} WHERE ${quoteIdentifier(to)} IS NULL AND ${quoteIdentifier(from)} IS NOT NULL`,
          );
        }
      }
    }

    await this.renameEnumTypes(queryRunner, reverse);
  }

  private async renameEnumTypes(
    queryRunner: QueryRunner,
    reverse: boolean,
  ): Promise<void> {
    await reconcileEntityEnumTypes(queryRunner, reverse);
  }
}
