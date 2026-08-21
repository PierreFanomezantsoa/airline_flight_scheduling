import {
  MigrationInterface,
  QueryRunner,
  Table,
} from 'typeorm';

export class CreateNetworkConfiguration20260821120000
  implements MigrationInterface
{
  name = 'CreateNetworkConfiguration20260821120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('network_configuration')) return;

    await queryRunner.createTable(
      new Table({
        name: 'network_configuration',
        columns: [
          { name: 'id', type: 'varchar', length: '40', isPrimary: true },
          { name: 'mediumHaulTurnaroundMinutes', type: 'integer', default: 45 },
          { name: 'longHaulTurnaroundMinutes', type: 'integer', default: 90 },
          { name: 'positioningBufferMinutes', type: 'integer', default: 180 },
          { name: 'minimumCrewRestHours', type: 'integer', default: 10 },
          { name: 'maximumContinuousFlightHours', type: 'integer', default: 8 },
          { name: 'maintenanceWarningHours', type: 'integer', default: 10 },
          {
            name: 'hubIataCodes',
            type: 'text',
            default: `'["TNR","WFI","CDG"]'`,
          },
          { name: 'createdAt', type: 'timestamptz', default: 'now()' },
          { name: 'updatedAt', type: 'timestamptz', default: 'now()' },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('network_configuration')) {
      await queryRunner.dropTable('network_configuration');
    }
  }
}
