import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserApprovalWorkflow20260831153000
  implements MigrationInterface
{
  name = 'AddUserApprovalWorkflow20260831153000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typname = 'users_account_status_enum'
            AND n.nspname = 'public'
        ) THEN
          CREATE TYPE "public"."users_account_status_enum"
          AS ENUM('PENDING', 'APPROVED', 'REJECTED');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "accountStatus"
      "public"."users_account_status_enum" NOT NULL DEFAULT 'PENDING'
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP WITH TIME ZONE
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "approvedBy" uuid
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "rejectedAt" TIMESTAMP WITH TIME ZONE
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "rejectedBy" uuid
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "rejectionReason" text
    `);

    /*
     * Compatibilité avec la base existante : les comptes qui existaient avant
     * cette migration sont considérés déjà validés. Cela évite de bloquer
     * notamment le compte administrateur actuel.
     */
    await queryRunner.query(`
      UPDATE "users"
      SET
        "accountStatus" = 'APPROVED',
        "approvedAt" = COALESCE("approvedAt", NOW())
      WHERE "accountStatus" = 'PENDING'
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_users_accountStatus"
      ON "users" ("accountStatus")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_accountStatus"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "rejectionReason"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "rejectedBy"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "rejectedAt"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "approvedBy"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "approvedAt"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "accountStatus"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."users_account_status_enum"`);
  }
}
