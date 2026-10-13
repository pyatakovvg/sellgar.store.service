import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAccountingStore1791806400000 implements MigrationInterface {
  readonly name = 'CreateAccountingStore1791806400000';
  async up(runner: QueryRunner): Promise<void> {
    const schema = this.schema(runner);
    await runner.query(`SET LOCAL search_path TO "${schema}", public`);
    for (const statement of this.statements) await runner.query(statement);
  }
  async down(): Promise<void> {
    throw new Error(
      'Accounting inventory is not dropped automatically. Restore a backup or reset the disposable development database explicitly.',
    );
  }
  private schema(runner: QueryRunner): string {
    const schema = (runner.connection.options as { schema?: string }).schema ?? 'public';
    return schema.replace(/"/g, '""');
  }
  private readonly statements: string[] = [
    'CREATE TABLE "currency" ("code" character varying(3) NOT NULL, "value" character varying(64) NOT NULL, "order" integer NOT NULL DEFAULT \'0\', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_723472e41cae44beb0763f4039c" PRIMARY KEY ("code")); COMMENT ON COLUMN "currency"."created_at" IS \'дата создания\'; COMMENT ON COLUMN "currency"."updated_at" IS \'дата обновления\'',
    'CREATE TABLE "price_history" ("uuid" uuid NOT NULL DEFAULT gen_random_uuid(), "offer_uuid" uuid NOT NULL, "value" numeric(12,2) NOT NULL DEFAULT \'0.00\', "currency_code" character varying(3) NOT NULL, "starts_at" TIMESTAMP NOT NULL DEFAULT now(), "ends_at" TIMESTAMP, "reason" character varying(512), "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_edc7ddcbbd50a5474360f2053f3" PRIMARY KEY ("uuid")); COMMENT ON COLUMN "price_history"."created_at" IS \'дата создания\'',
    'CREATE TABLE "product_snapshot" ("product_uuid" uuid NOT NULL, "source_producer" character varying(128) NOT NULL DEFAULT \'product_srv_v2\', "source_version" integer NOT NULL, "name" character varying(256) NOT NULL, "status" character varying(64) NOT NULL, "synced_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_dcc83af9f2cb6bb00f693eae6e9" PRIMARY KEY ("product_uuid"))',
    'CREATE TABLE "shop_snapshot" ("shop_uuid" uuid NOT NULL, "source_version" integer NOT NULL, "name" character varying(512) NOT NULL, "synced_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_4e8d6fa5ca4a5bba95f4f1ccecc" PRIMARY KEY ("shop_uuid"))',
    "CREATE TYPE \"store_product_status_enum\" AS ENUM('active', 'disabled', 'archived')",
    'CREATE TABLE "store_product" ("uuid" uuid NOT NULL DEFAULT gen_random_uuid(), "version" integer NOT NULL DEFAULT \'1\', "shop_uuid" uuid NOT NULL, "product_uuid" uuid NOT NULL, "status" "store_product_status_enum" NOT NULL DEFAULT \'active\', "showing" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_944ed0c3575aa60af9fce2d0c46" PRIMARY KEY ("uuid")); COMMENT ON COLUMN "store_product"."created_at" IS \'дата создания\'; COMMENT ON COLUMN "store_product"."updated_at" IS \'дата обновления\'',
    'CREATE INDEX "IDX_998c9415c9d9e19ebaee79b229" ON "store_product"  ("shop_uuid") ',
    'CREATE INDEX "IDX_e25650b86c29befdc7248a7161" ON "store_product"  ("product_uuid") ',
    'CREATE UNIQUE INDEX "IDX_7c947824fcf0b768c82526e439" ON "store_product"  ("uuid", "product_uuid") ',
    'CREATE TABLE "variant_snapshot" ("variant_uuid" uuid NOT NULL, "product_uuid" uuid NOT NULL, "source_version" integer NOT NULL, "name" character varying(256) NOT NULL, "status" character varying(64) NOT NULL, "synced_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_01d40d0f2afaf9351a57b73005e" PRIMARY KEY ("variant_uuid"))',
    'CREATE INDEX "IDX_d63a958a746ef484f442751356" ON "variant_snapshot"  ("product_uuid") ',
    'CREATE UNIQUE INDEX "IDX_b68053da16d12faf7a539c080a" ON "variant_snapshot"  ("product_uuid", "variant_uuid") ',
    "CREATE TYPE \"store_offer_status_enum\" AS ENUM('active', 'disabled', 'archived')",
    'CREATE TABLE "store_offer" ("uuid" uuid NOT NULL DEFAULT gen_random_uuid(), "version" integer NOT NULL DEFAULT \'1\', "store_product_uuid" uuid NOT NULL, "product_uuid" uuid NOT NULL, "variant_uuid" uuid NOT NULL, "status" "store_offer_status_enum" NOT NULL DEFAULT \'active\', "showing" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_2919b3d0f369c3accc730520f6b" PRIMARY KEY ("uuid")); COMMENT ON COLUMN "store_offer"."created_at" IS \'дата создания\'; COMMENT ON COLUMN "store_offer"."updated_at" IS \'дата обновления\'',
    'CREATE INDEX "IDX_e4a3754021cc870f35dce05360" ON "store_offer"  ("variant_uuid") ',
    'CREATE UNIQUE INDEX "IDX_912e626aacbd0e0aa208e1546f" ON "store_offer"  ("store_product_uuid", "variant_uuid") ',
    'CREATE TABLE "record_clarification" ("record_uuid" uuid NOT NULL, "position" integer NOT NULL, "value" text NOT NULL, CONSTRAINT "record_clarification_value_ck" CHECK (length(btrim(value)) > 0), CONSTRAINT "record_clarification_position_ck" CHECK (position >= 0), CONSTRAINT "PK_88a98860a6e1412a08ee5cd7c51" PRIMARY KEY ("record_uuid", "position"))',
    'CREATE TABLE "record_inventory" ("uuid" uuid NOT NULL DEFAULT gen_random_uuid(), "record_uuid" uuid NOT NULL, "quantity" integer NOT NULL DEFAULT \'0\', "reserved" integer NOT NULL DEFAULT \'0\', "version" integer NOT NULL DEFAULT \'1\', "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "REL_5217222ecd9402e7211aada437" UNIQUE ("record_uuid"), CONSTRAINT "record_inventory_quantity_ck" CHECK (quantity >= 0 AND reserved >= 0 AND reserved <= quantity), CONSTRAINT "PK_8f5bbc5b25bed87856e34481d92" PRIMARY KEY ("uuid")); COMMENT ON COLUMN "record_inventory"."updated_at" IS \'дата обновления\'',
    "CREATE TYPE \"inventory_movement_type_enum\" AS ENUM('receipt', 'write_off', 'adjustment', 'reserve', 'release', 'sale')",
    "CREATE TYPE \"inventory_movement_source_type_enum\" AS ENUM('manual', 'cart', 'order', 'import', 'correction')",
    'CREATE TABLE "inventory_movement" ("uuid" uuid NOT NULL DEFAULT gen_random_uuid(), "record_uuid" uuid NOT NULL, "type" "inventory_movement_type_enum" NOT NULL, "quantity_delta" integer NOT NULL DEFAULT \'0\', "reserved_delta" integer NOT NULL DEFAULT \'0\', "source_type" "inventory_movement_source_type_enum" NOT NULL DEFAULT \'manual\', "source_uuid" uuid, "reason" character varying(512), "created_by" uuid, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_405c825097b3e26c2a44d721637" PRIMARY KEY ("uuid"))',
    'CREATE INDEX "IDX_542bb843634e947b0b40691db9" ON "inventory_movement"  ("record_uuid") ',
    'CREATE TABLE "accounting_record" ("uuid" uuid NOT NULL DEFAULT gen_random_uuid(), "offer_uuid" uuid NOT NULL, "article" character varying(256) NOT NULL, "version" integer NOT NULL DEFAULT \'1\', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "accounting_record_article_ck" CHECK (length(btrim(article)) > 0 AND article = btrim(article)), CONSTRAINT "PK_24e68658026d89e99ca0028ce8c" PRIMARY KEY ("uuid"))',
    'CREATE INDEX "accounting_record_offer_idx" ON "accounting_record"  ("offer_uuid") ',
    'CREATE UNIQUE INDEX "accounting_record_article_uq" ON "accounting_record"  ("article") ',
    'CREATE TABLE "command_request" ("command_id" uuid NOT NULL, "command_type" character varying(128) NOT NULL, "request_hash" character varying(128) NOT NULL, "status" character varying(64) NOT NULL, "result" jsonb, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_660a9345ff91d0e68b6a4ef3ccc" PRIMARY KEY ("command_id"))',
    'CREATE TABLE "inbox_event" ("event_uuid" uuid NOT NULL, "producer" character varying(128) NOT NULL, "schema_version" integer NOT NULL, "event_type" character varying(128) NOT NULL, "aggregate_type" character varying(128) NOT NULL, "aggregate_uuid" uuid NOT NULL, "aggregate_version" integer NOT NULL, "received_at" TIMESTAMP NOT NULL DEFAULT now(), "processed_at" TIMESTAMP, "status" character varying(64) NOT NULL DEFAULT \'received\', "attempts" integer NOT NULL DEFAULT \'0\', "last_error" text, CONSTRAINT "PK_d56b27e9a8c04ecfdd23f7d25f3" PRIMARY KEY ("event_uuid"))',
    'CREATE INDEX "IDX_28fa7da1fdfe2df753bcff092a" ON "inbox_event"  ("aggregate_type", "aggregate_uuid", "aggregate_version") ',
    'CREATE TABLE "outbox_event" ("uuid" uuid NOT NULL DEFAULT gen_random_uuid(), "producer" character varying(128) NOT NULL, "aggregate_type" character varying(128) NOT NULL, "aggregate_uuid" uuid NOT NULL, "aggregate_version" integer NOT NULL, "event_type" character varying(128) NOT NULL, "schema_version" integer NOT NULL DEFAULT \'1\', "payload" jsonb NOT NULL, "occurred_at" TIMESTAMP NOT NULL DEFAULT now(), "published_at" TIMESTAMP, "next_attempt_at" TIMESTAMP DEFAULT now(), "processing_started_at" TIMESTAMP, "status" character varying(64) NOT NULL DEFAULT \'pending\', "attempts" integer NOT NULL DEFAULT \'0\', "last_error" text, CONSTRAINT "PK_ba7f5d59601bdaf8fe3985247a2" PRIMARY KEY ("uuid"))',
    'CREATE INDEX "IDX_23c4d91892008f0a2c027f917e" ON "outbox_event"  ("status", "next_attempt_at", "occurred_at") ',
    'CREATE UNIQUE INDEX "IDX_f625246b37e10319b3f8fd41be" ON "outbox_event"  ("aggregate_type", "aggregate_uuid", "aggregate_version") ',
    'CREATE TABLE "sync_issue" ("uuid" uuid NOT NULL DEFAULT gen_random_uuid(), "producer" character varying(128) NOT NULL, "aggregate_type" character varying(128) NOT NULL, "aggregate_uuid" uuid NOT NULL, "expected_version" integer, "received_version" integer NOT NULL, "event_uuid" uuid NOT NULL, "reason" character varying(128) NOT NULL, "payload" jsonb NOT NULL, "status" character varying(64) NOT NULL DEFAULT \'open\', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "resolved_at" TIMESTAMP, CONSTRAINT "PK_d69bfe18cf0dfacf372fdbf38c2" PRIMARY KEY ("uuid"))',
    'ALTER TABLE "price_history" ADD CONSTRAINT "FK_bf9fc63db846ccd58107c7fb937" FOREIGN KEY ("offer_uuid") REFERENCES "store_offer"("uuid") ON DELETE CASCADE ON UPDATE NO ACTION',
    'ALTER TABLE "price_history" ADD CONSTRAINT "FK_0f59a5e902cce84acb96baf9b85" FOREIGN KEY ("currency_code") REFERENCES "currency"("code") ON DELETE NO ACTION ON UPDATE NO ACTION',
    'ALTER TABLE "store_product" ADD CONSTRAINT "store_product_product_fk" FOREIGN KEY ("product_uuid") REFERENCES "product_snapshot"("product_uuid") ON DELETE RESTRICT ON UPDATE NO ACTION',
    'ALTER TABLE "store_product" ADD CONSTRAINT "store_product_shop_fk" FOREIGN KEY ("shop_uuid") REFERENCES "shop_snapshot"("shop_uuid") ON DELETE RESTRICT ON UPDATE NO ACTION',
    'ALTER TABLE "variant_snapshot" ADD CONSTRAINT "variant_snapshot_product_fk" FOREIGN KEY ("product_uuid") REFERENCES "product_snapshot"("product_uuid") ON DELETE RESTRICT ON UPDATE NO ACTION',
    'ALTER TABLE "store_offer" ADD CONSTRAINT "FK_9037069d725a63e37b811f71c5f" FOREIGN KEY ("store_product_uuid", "product_uuid") REFERENCES "store_product"("uuid","product_uuid") ON DELETE CASCADE ON UPDATE NO ACTION',
    'ALTER TABLE "store_offer" ADD CONSTRAINT "FK_abfdf45fd05822a5f9b8f19c262" FOREIGN KEY ("variant_uuid", "product_uuid") REFERENCES "variant_snapshot"("variant_uuid","product_uuid") ON DELETE RESTRICT ON UPDATE NO ACTION',
    'ALTER TABLE "record_clarification" ADD CONSTRAINT "record_clarification_record_fk" FOREIGN KEY ("record_uuid") REFERENCES "accounting_record"("uuid") ON DELETE CASCADE ON UPDATE NO ACTION',
    'ALTER TABLE "record_inventory" ADD CONSTRAINT "FK_5217222ecd9402e7211aada437a" FOREIGN KEY ("record_uuid") REFERENCES "accounting_record"("uuid") ON DELETE RESTRICT ON UPDATE NO ACTION',
    'ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_record_fk" FOREIGN KEY ("record_uuid") REFERENCES "accounting_record"("uuid") ON DELETE RESTRICT ON UPDATE NO ACTION',
    'ALTER TABLE "accounting_record" ADD CONSTRAINT "accounting_record_offer_fk" FOREIGN KEY ("offer_uuid") REFERENCES "store_offer"("uuid") ON DELETE RESTRICT ON UPDATE NO ACTION',
  ];
}
