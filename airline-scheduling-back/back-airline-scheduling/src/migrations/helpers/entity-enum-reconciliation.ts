import { QueryRunner } from 'typeorm';

const enumColumnRenames = [
  { table: 'flights', from: 'statut', to: 'status' },
  { table: 'aircrafts', from: 'statut', to: 'status' },
  { table: 'crew_assignments', from: 'fonction', to: 'crewRole' },
];

const quoteIdentifier = (identifier: string): string =>
  `"${identifier.replace(/"/g, '""')}"`;

export async function reconcileEntityEnumTypes(
  queryRunner: QueryRunner,
  reverse = false,
): Promise<void> {
  for (const enumColumn of enumColumnRenames) {
    const columnName = reverse ? enumColumn.from : enumColumn.to;
    const expectedName = `${enumColumn.table}_${columnName.toLowerCase()}_enum`;
    const [column] = await queryRunner.query(
      `
        SELECT udt_schema AS "typeSchema", udt_name AS "typeName"
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = $1
          AND column_name = $2
      `,
      [enumColumn.table, columnName],
    );

    if (!column?.typeName || column.typeName === expectedName) {
      continue;
    }

    const [expectedType] = await queryRunner.query(
      `
        SELECT 1
        FROM pg_type AS type
        JOIN pg_namespace AS namespace ON namespace.oid = type.typnamespace
        WHERE namespace.nspname = current_schema()
          AND type.typname = $1
      `,
      [expectedName],
    );

    if (!expectedType) {
      await queryRunner.query(
        `ALTER TYPE ${quoteIdentifier(column.typeSchema)}.${quoteIdentifier(column.typeName)} RENAME TO ${quoteIdentifier(expectedName)}`,
      );
      continue;
    }

    const [expectedTypeUsage] = await queryRunner.query(
      `
        SELECT COUNT(*)::int AS count
        FROM information_schema.columns
        WHERE table_schema = $1
          AND udt_schema = $1
          AND udt_name = $2
      `,
      [column.typeSchema, expectedName],
    );

    if (Number(expectedTypeUsage?.count) !== 0) {
      throw new Error(
        `Cannot reconcile enum types ${column.typeName} and ${expectedName}: the target type is already used by another column`,
      );
    }

    await queryRunner.query(
      `DROP TYPE ${quoteIdentifier(column.typeSchema)}.${quoteIdentifier(expectedName)}`,
    );
    await queryRunner.query(
      `ALTER TYPE ${quoteIdentifier(column.typeSchema)}.${quoteIdentifier(column.typeName)} RENAME TO ${quoteIdentifier(expectedName)}`,
    );
  }
}
