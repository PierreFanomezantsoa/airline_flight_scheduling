import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
} from 'typeorm';

export class AddFlightHoursAccounting20260902123000
  implements MigrationInterface
{
  name = 'AddFlightHoursAccounting20260902123000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('flights'))) {
      return;
    }

    if (!(await queryRunner.hasColumn('flights', 'heuresComptabilisees'))) {
      await queryRunner.addColumn(
        'flights',
        new TableColumn({
          name: 'heuresComptabilisees',
          type: 'boolean',
          isNullable: false,
          default: false,
        }),
      );
    }

    if (!(await queryRunner.hasColumn('flights', 'heuresCreditees'))) {
      await queryRunner.addColumn(
        'flights',
        new TableColumn({
          name: 'heuresCreditees',
          type: 'double precision',
          isNullable: true,
        }),
      );
    }

    if (!(await queryRunner.hasColumn('flights', 'heuresComptabiliseesAt'))) {
      await queryRunner.addColumn(
        'flights',
        new TableColumn({
          name: 'heuresComptabiliseesAt',
          type: 'timestamptz',
          isNullable: true,
        }),
      );
    }

    /*
     * Les vols historiques restent volontairement à false.
     * Ainsi, aucune heure passée n'est ajoutée silencieusement pendant la
     * migration. Si les compteurs actuels ne contiennent pas encore ces vols,
     * l'administrateur peut lancer UNE FOIS PATCH /flights/sync/completed.
     */
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('flights'))) {
      return;
    }

    for (const columnName of [
      'heuresComptabiliseesAt',
      'heuresCreditees',
      'heuresComptabilisees',
    ]) {
      if (await queryRunner.hasColumn('flights', columnName)) {
        await queryRunner.dropColumn('flights', columnName);
      }
    }
  }
}
