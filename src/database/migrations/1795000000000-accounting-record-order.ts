import { MigrationInterface, QueryRunner } from 'typeorm';

export class AccountingRecordOrder1795000000000 implements MigrationInterface {
  name = 'AccountingRecordOrder1795000000000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query('ALTER TABLE accounting_record ADD COLUMN "order" integer');
    await runner.query(`WITH ranked AS (
      SELECT uuid, (row_number() OVER (PARTITION BY offer_uuid ORDER BY created_at, uuid) - 1)::integer AS "order"
      FROM accounting_record
    ) UPDATE accounting_record record SET "order" = ranked."order" FROM ranked WHERE record.uuid = ranked.uuid`);
    await runner.query('ALTER TABLE accounting_record ALTER COLUMN "order" SET NOT NULL');
    await runner.query('ALTER TABLE accounting_record ADD CONSTRAINT accounting_record_order_ck CHECK ("order" >= 0)');
    await runner.query(`ALTER TABLE accounting_record ADD CONSTRAINT accounting_record_offer_order_uq
      UNIQUE (offer_uuid, "order") DEFERRABLE INITIALLY DEFERRED`);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query('ALTER TABLE accounting_record DROP COLUMN "order"');
  }
}
