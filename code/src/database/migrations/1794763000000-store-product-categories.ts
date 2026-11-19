import { MigrationInterface, QueryRunner } from 'typeorm';

export class StoreProductCategories1794763000000 implements MigrationInterface {
  name = 'StoreProductCategories1794763000000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query('ALTER TABLE store_product ADD CONSTRAINT store_product_uuid_shop_uq UNIQUE (uuid, shop_uuid)');
    await runner.query(`CREATE TABLE store_product_category (
      store_product_uuid uuid NOT NULL,
      category_uuid uuid NOT NULL,
      shop_uuid uuid NOT NULL,
      CONSTRAINT store_product_category_pkey PRIMARY KEY (store_product_uuid, category_uuid),
      CONSTRAINT store_product_category_product_fk FOREIGN KEY (store_product_uuid, shop_uuid)
        REFERENCES store_product(uuid, shop_uuid) ON DELETE CASCADE,
      CONSTRAINT store_product_category_category_fk FOREIGN KEY (category_uuid, shop_uuid)
        REFERENCES category(uuid, shop_uuid) ON DELETE RESTRICT
    )`);
    await runner.query(
      'CREATE INDEX store_product_category_category_idx ON store_product_category (category_uuid, shop_uuid)',
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE store_product_category');
    await runner.query('ALTER TABLE store_product DROP CONSTRAINT store_product_uuid_shop_uq');
  }
}
