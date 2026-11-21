import { MigrationInterface, QueryRunner } from 'typeorm';

export class RecordPrices1795300000000 implements MigrationInterface {
  readonly name = 'RecordPrices1795300000000';

  async up(runner: QueryRunner): Promise<void> {
    const schema = (runner.connection.options as { schema?: string }).schema ?? 'public';
    await runner.query(`SET LOCAL search_path TO "${schema.replace(/"/g, '""')}", public`);
    // Each record inherits the complete history, including closed prices and their timestamps.
    // Record/inventory identity is unchanged. New price identities are local to each record.
    await runner.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM price_history p WHERE NOT EXISTS
        (SELECT 1 FROM accounting_record r WHERE r.offer_uuid=p.offer_uuid)) THEN
        RAISE EXCEPTION 'Cannot migrate price history without accounting records';
      END IF;
    END $$`);
    await runner.query('CREATE TEMP TABLE migrating_offer_prices ON COMMIT DROP AS SELECT * FROM price_history');
    await runner.query('DELETE FROM price_history');
    await runner.query('ALTER TABLE price_history DROP CONSTRAINT "FK_bf9fc63db846ccd58107c7fb937"');
    await runner.query('ALTER TABLE price_history RENAME COLUMN offer_uuid TO record_uuid');
    await runner.query(`ALTER TABLE price_history ADD CONSTRAINT price_history_record_fk
      FOREIGN KEY(record_uuid) REFERENCES accounting_record(uuid) ON DELETE CASCADE`);
    // Preserve the old latest-price ordering even when several rows share created_at.
    // New UUIDs are sorted and assigned in the same order as the original history.
    await runner.query(`WITH inherited AS (
        SELECT r.uuid AS record_uuid, p.* FROM migrating_offer_prices p
        JOIN accounting_record r ON r.offer_uuid=p.offer_uuid
      ), history AS (
        SELECT inherited.*, row_number() OVER (PARTITION BY record_uuid ORDER BY created_at,uuid) AS position
        FROM inherited
      ), identities AS (
        SELECT record_uuid,new_uuid,row_number() OVER (PARTITION BY record_uuid ORDER BY new_uuid) AS position
        FROM (SELECT record_uuid,gen_random_uuid() AS new_uuid FROM inherited) generated
      )
      INSERT INTO price_history(uuid,record_uuid,value,currency_code,starts_at,ends_at,reason,created_at)
      SELECT i.new_uuid,h.record_uuid,h.value,h.currency_code,h.starts_at,h.ends_at,h.reason,h.created_at
      FROM history h JOIN identities i USING(record_uuid,position)`);
    await runner.query(
      'CREATE INDEX price_history_record_created_idx ON price_history(record_uuid,created_at DESC,uuid DESC)',
    );
  }

  async down(): Promise<void> {
    throw new Error('Record prices cannot be merged into one offer price without losing data. Restore a backup.');
  }
}
