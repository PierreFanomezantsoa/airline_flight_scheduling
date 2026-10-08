import { MigrationInterface, QueryRunner } from 'typeorm';
import { reconcileEntityEnumTypes } from './helpers/entity-enum-reconciliation';

export class ReconcileEntityEnumTypes20261008121500
  implements MigrationInterface
{
  name = 'ReconcileEntityEnumTypes20261008121500';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await reconcileEntityEnumTypes(queryRunner);
  }

  public async down(): Promise<void> {
    throw new Error(
      'ReconcileEntityEnumTypes20261008121500 cannot be reverted automatically.',
    );
  }
}
