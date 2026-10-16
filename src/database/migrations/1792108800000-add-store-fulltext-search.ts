import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStoreFulltextSearch1792108800000 implements MigrationInterface {
  name = 'AddStoreFulltextSearch1792108800000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query("ALTER TABLE accounting_record ADD COLUMN search_vector tsvector NOT NULL DEFAULT ''::tsvector");
    await runner.query(`
      CREATE FUNCTION store_search_query(term text) RETURNS tsquery
      LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
        SELECT coalesce(string_agg(
          '(' || (to_tsquery('simple', quote_literal(token) || ':*') || plainto_tsquery('russian', token))::text || ')',
          ' & ' ORDER BY token
        ), '')::tsquery
        FROM unnest(tsvector_to_array(to_tsvector('simple', term))) AS tokens(token)
      $$
    `);
    await runner.query(`
      CREATE FUNCTION store_record_search_document(offer_id uuid, article text) RETURNS tsvector
      LANGUAGE sql STABLE STRICT AS $$
        SELECT setweight(to_tsvector('simple', article), 'A') ||
          setweight(to_tsvector('simple', p.name) || to_tsvector('russian', p.name), 'B') ||
          setweight(to_tsvector('simple', v.name) || to_tsvector('russian', v.name), 'B')
        FROM store_offer o
        JOIN product_snapshot p ON p.product_uuid = o.product_uuid
        JOIN variant_snapshot v ON v.variant_uuid = o.variant_uuid
        WHERE o.uuid = offer_id
      $$
    `);
    await runner.query(`
      CREATE FUNCTION store_record_search_changed() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        NEW.search_vector := store_record_search_document(NEW.offer_uuid, NEW.article);
        RETURN NEW;
      END;
      $$
    `);
    await runner.query(`
      CREATE TRIGGER store_record_search_changed
      BEFORE INSERT OR UPDATE OF article, offer_uuid ON accounting_record
      FOR EACH ROW EXECUTE FUNCTION store_record_search_changed()
    `);
    await runner.query(`
      CREATE FUNCTION store_product_search_changed() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        UPDATE accounting_record r SET search_vector = store_record_search_document(r.offer_uuid, r.article)
        FROM store_offer o WHERE o.uuid = r.offer_uuid AND o.product_uuid = NEW.product_uuid;
        RETURN NEW;
      END;
      $$
    `);
    await runner.query(`
      CREATE TRIGGER store_product_search_changed AFTER UPDATE OF name ON product_snapshot
      FOR EACH ROW WHEN (OLD.name IS DISTINCT FROM NEW.name)
      EXECUTE FUNCTION store_product_search_changed()
    `);
    await runner.query(`
      CREATE FUNCTION store_variant_search_changed() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        UPDATE accounting_record r SET search_vector = store_record_search_document(r.offer_uuid, r.article)
        FROM store_offer o WHERE o.uuid = r.offer_uuid AND o.variant_uuid = NEW.variant_uuid;
        RETURN NEW;
      END;
      $$
    `);
    await runner.query(`
      CREATE TRIGGER store_variant_search_changed AFTER UPDATE OF name ON variant_snapshot
      FOR EACH ROW WHEN (OLD.name IS DISTINCT FROM NEW.name)
      EXECUTE FUNCTION store_variant_search_changed()
    `);
    await runner.query(`
      CREATE FUNCTION store_offer_search_changed() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        UPDATE accounting_record SET search_vector = store_record_search_document(offer_uuid, article)
        WHERE offer_uuid = NEW.uuid;
        RETURN NEW;
      END;
      $$
    `);
    await runner.query(`
      CREATE TRIGGER store_offer_search_changed AFTER UPDATE OF product_uuid, variant_uuid ON store_offer
      FOR EACH ROW WHEN (OLD.product_uuid IS DISTINCT FROM NEW.product_uuid OR OLD.variant_uuid IS DISTINCT FROM NEW.variant_uuid)
      EXECUTE FUNCTION store_offer_search_changed()
    `);
    await runner.query(
      'UPDATE accounting_record SET search_vector = store_record_search_document(offer_uuid, article)',
    );
    await runner.query('ALTER TABLE accounting_record ALTER COLUMN search_vector DROP DEFAULT');
    await runner.query('CREATE INDEX accounting_record_search_idx ON accounting_record USING GIN(search_vector)');
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TRIGGER store_offer_search_changed ON store_offer');
    await runner.query('DROP TRIGGER store_variant_search_changed ON variant_snapshot');
    await runner.query('DROP TRIGGER store_product_search_changed ON product_snapshot');
    await runner.query('DROP TRIGGER store_record_search_changed ON accounting_record');
    await runner.query('DROP FUNCTION store_offer_search_changed()');
    await runner.query('DROP FUNCTION store_variant_search_changed()');
    await runner.query('DROP FUNCTION store_product_search_changed()');
    await runner.query('DROP FUNCTION store_record_search_changed()');
    await runner.query('DROP FUNCTION store_record_search_document(uuid, text)');
    await runner.query('DROP FUNCTION store_search_query(text)');
    await runner.query('DROP INDEX accounting_record_search_idx');
    await runner.query('ALTER TABLE accounting_record DROP COLUMN search_vector');
  }
}
