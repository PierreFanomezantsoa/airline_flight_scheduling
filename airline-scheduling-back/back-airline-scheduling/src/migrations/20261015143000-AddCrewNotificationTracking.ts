import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddCrewNotificationTracking20261015143000
  implements MigrationInterface
{
  name = 'AddCrewNotificationTracking20261015143000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('crew_assignments'))) return;

    const columns: TableColumn[] = [
      new TableColumn({
        name: 'notification_status',
        type: 'varchar',
        length: '16',
        isNullable: false,
        default: "'PENDING'",
      }),
      new TableColumn({
        name: 'assignment_notified_at',
        type: 'timestamptz',
        isNullable: true,
      }),
      new TableColumn({
        name: 'reminder_2h_sent_at',
        type: 'timestamptz',
        isNullable: true,
      }),
      new TableColumn({
        name: 'reminder_1h_sent_at',
        type: 'timestamptz',
        isNullable: true,
      }),
      new TableColumn({
        name: 'last_notification_error',
        type: 'varchar',
        length: '500',
        isNullable: true,
      }),
    ];

    for (const column of columns) {
      if (!(await queryRunner.hasColumn('crew_assignments', column.name))) {
        await queryRunner.addColumn('crew_assignments', column);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('crew_assignments'))) return;

    for (const columnName of [
      'last_notification_error',
      'reminder_1h_sent_at',
      'reminder_2h_sent_at',
      'assignment_notified_at',
      'notification_status',
    ]) {
      if (await queryRunner.hasColumn('crew_assignments', columnName)) {
        await queryRunner.dropColumn('crew_assignments', columnName);
      }
    }
  }
}
