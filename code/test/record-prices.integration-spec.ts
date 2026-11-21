import 'reflect-metadata';
import { beforeAll, afterAll, describe, it, expect } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
config({ path: '.env', quiet: true });
import { DataSource } from 'typeorm';
import { StoreDatabaseOptions } from '../src/database/store-database.options';
import { RecordPrices1795300000000 } from '../src/database/migrations/1795300000000-record-prices';

describe('Upgrade from offer prices to accounting record prices', () => {
  const schema = `store_price_test_${randomUUID().replace(/-/g, '')}`;
  const env = { ...process.env, STORE_DATABASE_SCHEMA: schema };
  let source: DataSource;

  beforeAll(async () => {
    source = await new DataSource(StoreDatabaseOptions.create(env)).initialize();
    await source.query(`CREATE SCHEMA "${schema}"`);
    const runner = source.createQueryRunner();
    await runner.startTransaction();
    try {
      for (const migration of source.migrations) {
        if (!(migration instanceof RecordPrices1795300000000)) await migration.up(runner);
      }
      await runner.commitTransaction();
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  });

  afterAll(async () => {
    if (source?.isInitialized) {
      await source.query(`DROP SCHEMA "${schema}" CASCADE`);
      await source.destroy();
    }
  });

  it('copies complete history to every record without changing inventory, record identity or source versions', async () => {
    const shop = randomUUID(),
      product = randomUUID(),
      variant = randomUUID(),
      root = randomUUID(),
      offer = randomUUID();
    const records = [randomUUID(), randomUUID()];
    await source.query("INSERT INTO currency(code,value) VALUES ('RUB','руб.')");
    await source.query("INSERT INTO shop_snapshot(shop_uuid,source_version,name) VALUES ($1,1,'Shop')", [shop]);
    await source.query(
      "INSERT INTO product_snapshot(product_uuid,source_version,name,status) VALUES ($1,1,'Phone','active')",
      [product],
    );
    await source.query(
      "INSERT INTO variant_snapshot(variant_uuid,product_uuid,source_version,name,status) VALUES ($1,$2,1,'Black','active')",
      [variant, product],
    );
    await source.query('INSERT INTO store_product(uuid,shop_uuid,product_uuid,version) VALUES ($1,$2,$3,7)', [
      root,
      shop,
      product,
    ]);
    await source.query(
      'INSERT INTO store_offer(uuid,store_product_uuid,product_uuid,variant_uuid) VALUES ($1,$2,$3,$4)',
      [offer, root, product, variant],
    );
    for (const [order, record] of records.entries()) {
      await source.query('INSERT INTO accounting_record(uuid,offer_uuid,article,"order") VALUES ($1,$2,$3,$4)', [
        record,
        offer,
        `SKU-${order}`,
        order,
      ]);
      await source.query('INSERT INTO record_inventory(record_uuid,quantity,reserved,version) VALUES ($1,5,1,3)', [
        record,
      ]);
    }
    await source.query(
      `INSERT INTO price_history(uuid,offer_uuid,value,currency_code,starts_at,ends_at,created_at,reason)
      VALUES ('10000000-0000-4000-8000-000000000001',$1,'100.00','RUB','2026-01-01','2026-02-01','2026-01-01','Initial'),
             ('10000000-0000-4000-8000-000000000002',$1,'110.00','RUB','2026-02-01','2026-02-01','2026-02-01','Intermediate'),
             ('f0000000-0000-4000-8000-000000000003',$1,'125.50','RUB','2026-02-01',NULL,'2026-02-01','Updated')`,
      [offer],
    );
    const before = await source.query('SELECT * FROM record_inventory ORDER BY record_uuid');
    const runner = source.createQueryRunner();
    await runner.startTransaction();
    try {
      await new RecordPrices1795300000000().up(runner);
      await runner.commitTransaction();
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
    const prices = await source.query('SELECT * FROM price_history ORDER BY created_at,uuid');
    expect(prices).toHaveLength(6);
    expect(new Set(prices.map((price: { uuid: string }) => price.uuid)).size).toBe(6);
    for (const record of records) {
      expect(prices.filter((price: { record_uuid: string }) => price.record_uuid === record)).toMatchObject([
        {
          value: '100.00',
          reason: 'Initial',
          starts_at: new Date('2026-01-01T00:00:00'),
          ends_at: new Date('2026-02-01T00:00:00'),
        },
        {
          value: '110.00',
          reason: 'Intermediate',
          starts_at: new Date('2026-02-01T00:00:00'),
          ends_at: new Date('2026-02-01T00:00:00'),
        },
        { value: '125.50', reason: 'Updated', starts_at: new Date('2026-02-01T00:00:00'), ends_at: null },
      ]);
    }
    expect(await source.query('SELECT * FROM record_inventory ORDER BY record_uuid')).toEqual(before);
    expect((await source.query('SELECT version FROM store_product WHERE uuid=$1', [root]))[0].version).toBe(7);
  });
});
