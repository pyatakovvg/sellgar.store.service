import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCategoryTree1794733200000 implements MigrationInterface {
  name = 'CreateCategoryTree1794733200000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE category (
        uuid uuid NOT NULL DEFAULT gen_random_uuid(),
        version integer NOT NULL DEFAULT 1,
        shop_uuid uuid NOT NULL,
        parent_uuid uuid,
        name varchar(512) NOT NULL,
        description text,
        sort_order integer NOT NULL DEFAULT 0,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT category_pkey PRIMARY KEY (uuid),
        CONSTRAINT category_uuid_shop_uq UNIQUE (uuid, shop_uuid),
        CONSTRAINT category_shop_fk FOREIGN KEY (shop_uuid) REFERENCES shop_snapshot(shop_uuid) ON DELETE RESTRICT,
        CONSTRAINT category_parent_shop_fk FOREIGN KEY (parent_uuid, shop_uuid) REFERENCES category(uuid, shop_uuid) ON DELETE RESTRICT,
        CONSTRAINT category_name_ck CHECK (length(btrim(name)) > 0 AND name = btrim(name)),
        CONSTRAINT category_version_ck CHECK (version >= 1),
        CONSTRAINT category_sort_order_ck CHECK (sort_order >= 0),
        CONSTRAINT category_parent_ck CHECK (parent_uuid IS NULL OR parent_uuid <> uuid)
      )
    `);
    await runner.query('CREATE INDEX category_tree_idx ON category (shop_uuid, parent_uuid, sort_order, uuid)');
    await runner.query(
      'CREATE UNIQUE INDEX category_root_name_uq ON category (shop_uuid, lower(name)) WHERE parent_uuid IS NULL',
    );
    await runner.query(
      'CREATE UNIQUE INDEX category_sibling_name_uq ON category (shop_uuid, parent_uuid, lower(name)) WHERE parent_uuid IS NOT NULL',
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE category');
  }
}
