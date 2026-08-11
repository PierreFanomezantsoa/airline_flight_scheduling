import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
} from 'typeorm';

export class SafeExistingDataUpgrade20260811120000
  implements MigrationInterface
{
  name = 'SafeExistingDataUpgrade20260811120000';

  public async up(
    queryRunner: QueryRunner,
  ): Promise<void> {
    // ----------------------------------------------------------------
    // USERS
    // ----------------------------------------------------------------
    if (await queryRunner.hasTable('users')) {
      if (!(await queryRunner.hasColumn('users', 'actif'))) {
        await queryRunner.addColumn(
          'users',
          new TableColumn({
            name: 'actif',
            type: 'boolean',
            isNullable: false,
            default: true,
          }),
        );
      }

      if (!(await queryRunner.hasColumn('users', 'creeA'))) {
        await queryRunner.addColumn(
          'users',
          new TableColumn({
            name: 'creeA',
            type: 'timestamptz',
            isNullable: false,
            default: 'now()',
          }),
        );
      }

      if (!(await queryRunner.hasColumn('users', 'misAJourA'))) {
        await queryRunner.addColumn(
          'users',
          new TableColumn({
            name: 'misAJourA',
            type: 'timestamptz',
            isNullable: false,
            default: 'now()',
          }),
        );
      }
    }

    // ----------------------------------------------------------------
    // FLIGHTS.VERSION
    //
    // Une colonne NOT NULL ne peut pas être ajoutée directement à une
    // table qui contient déjà des lignes sans fournir de valeur initiale.
    // ----------------------------------------------------------------
    if (
      await queryRunner.hasTable('flights')
    ) {
      if (
        !(await queryRunner.hasColumn(
          'flights',
          'version',
        ))
      ) {
        await queryRunner.addColumn(
          'flights',
          new TableColumn({
            name: 'version',
            type: 'integer',
            isNullable: false,
            default: 1,
          }),
        );
      } else {
        await queryRunner.query(`
          UPDATE "flights"
          SET "version" = 1
          WHERE "version" IS NULL
        `);

        await queryRunner.query(`
          ALTER TABLE "flights"
          ALTER COLUMN "version"
          SET DEFAULT 1
        `);

        await queryRunner.query(`
          ALTER TABLE "flights"
          ALTER COLUMN "version"
          SET NOT NULL
        `);
      }
    }
  }

  public async down(
    queryRunner: QueryRunner,
  ): Promise<void> {
    if (
      await queryRunner.hasTable('flights')
      && await queryRunner.hasColumn(
        'flights',
        'version',
      )
    ) {
      await queryRunner.dropColumn(
        'flights',
        'version',
      );
    }

    if (await queryRunner.hasTable('users')) {
      for (const columnName of [
        'misAJourA',
        'creeA',
        'actif',
      ]) {
        if (
          await queryRunner.hasColumn(
            'users',
            columnName,
          )
        ) {
          await queryRunner.dropColumn(
            'users',
            columnName,
          );
        }
      }
    }
  }
}
