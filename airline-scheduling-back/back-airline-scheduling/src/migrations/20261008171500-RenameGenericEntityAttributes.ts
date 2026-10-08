import { MigrationInterface, QueryRunner } from 'typeorm';
import { reconcileEntityEnumTypes } from './helpers/entity-enum-reconciliation';

const columnRenames: Record<string, [string, string][]> = {
  airports: [['name', 'airport_name']],
  users: [['name', 'user_name']],
  flights: [['status', 'flight_status']],
  aircrafts: [['status', 'aircraft_status']],
  maintenance_slots: [['status', 'maintenance_status']],
};

const quoteIdentifier = (identifier: string): string =>
  `"${identifier.replace(/"/g, '""')}"`;

export class RenameGenericEntityAttributes20261008171500
  implements MigrationInterface
{
  name = 'RenameGenericEntityAttributes20261008171500';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.renameColumns(queryRunner, false);
    await reconcileEntityEnumTypes(queryRunner, false, true);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.renameColumns(queryRunner, true);
    await reconcileEntityEnumTypes(queryRunner, false, false);
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
        const [from, to] = reverse ? [newName, oldName] : [oldName, newName];

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
  }
}
