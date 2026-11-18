import { OutboxWriter } from '@sellgar/outbox';
import { STORE_OUTBOX_OPTIONS } from '../src/integration/outbox/store-outbox.options';
import { CategoryCommandRepository } from '../src/api/v1/category/repository/category-command.repository';
import { CommandRequestRepository } from '../src/api/v1/store-product/repository/command-request.repository';
import { StoreEventRepository } from '../src/api/v1/store-product/repository/store-event.repository';
import { CommandFactory } from '../src/api/v1/store-product/service/command/command.factory';
import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { config } from 'dotenv';

import { StoreDatabaseOptions } from '../src/database/store-database.options';
import { CategoryModel } from '../src/api/v1/category/model/category.model';
import { CategoryRepository } from '../src/api/v1/category/repository/category.repository';
import { CategoryService } from '../src/api/v1/category/service/category.service';

config({ path: '.env', quiet: true });

describe('Category trees in PostgreSQL', () => {
  const schema = `category_test_${randomUUID().replace(/-/g, '')}`;
  const shopUuid = randomUUID();
  const otherShopUuid = randomUUID();
  const rootUuid = randomUUID();
  const childUuid = randomUUID();
  const leafUuid = randomUUID();
  let source: DataSource;
  let service: CategoryService;

  beforeAll(async () => {
    const control = await new DataSource({
      ...StoreDatabaseOptions.create(process.env),
      entities: [],
      migrations: [],
    }).initialize();
    await control.query(`CREATE SCHEMA "${schema}"`);
    await control.destroy();
    source = await new DataSource(
      StoreDatabaseOptions.create({ ...process.env, STORE_DATABASE_SCHEMA: schema }),
    ).initialize();
    await source.runMigrations();
    service = new CategoryService(
      new CategoryRepository(source),
      new CategoryCommandRepository(
        new CommandRequestRepository(source),
        new StoreEventRepository(new OutboxWriter(STORE_OUTBOX_OPTIONS)),
      ),
      new CommandFactory(),
    );
    await source.query(
      "INSERT INTO shop_snapshot(shop_uuid,source_version,name) VALUES ($1,1,'Первый'),($2,1,'Второй')",
      [shopUuid, otherShopUuid],
    );
    await source.getRepository(CategoryModel).insert([
      { uuid: rootUuid, shopUuid, parentUuid: null, name: 'Посуда', sortOrder: 1 },
      { uuid: randomUUID(), shopUuid, parentUuid: null, name: 'Туризм', sortOrder: 0 },
    ]);
    await source
      .getRepository(CategoryModel)
      .insert({ uuid: childUuid, shopUuid, parentUuid: rootUuid, name: 'Кружки' });
    await source
      .getRepository(CategoryModel)
      .insert({ uuid: leafUuid, shopUuid, parentUuid: childUuid, name: 'Термокружки' });
  });

  afterAll(async () => {
    if (source?.isInitialized) {
      await source.query(`DROP SCHEMA "${schema}" CASCADE`);
      await source.destroy();
    }
  });

  it('keeps migration and ORM metadata consistent', async () => {
    const changes = await source.driver.createSchemaBuilder().log();
    expect(changes.upQueries.map((query) => query.query)).toEqual([]);
  });

  it('returns sorted roots, descendants, leaf children and ISO dates', async () => {
    const tree = await service.getTree(shopUuid);
    expect(tree.shopUuid).toBe(shopUuid);
    expect(tree.nodes.map((node) => node.name)).toEqual(['Туризм', 'Посуда']);
    const child = tree.nodes[1].children[0];
    expect(child).toMatchObject({ uuid: childUuid, parentUuid: rootUuid, shopUuid });
    expect(child.children[0]).toMatchObject({ uuid: leafUuid, children: [], description: null });
    expect(new Date(child.createdAt).toISOString()).toBe(child.createdAt);
  });

  it('returns an empty tree for another shop and rejects an unknown shop', async () => {
    await expect(service.getTree(otherShopUuid)).resolves.toMatchObject({ shopUuid: otherShopUuid, nodes: [] });
    await expect(service.getTree(randomUUID())).rejects.toThrow('Shop not found');
  });

  it('rejects a parent from another shop', async () => {
    await expect(
      source.getRepository(CategoryModel).insert({ shopUuid: otherShopUuid, parentUuid: rootUuid, name: 'Чужая' }),
    ).rejects.toMatchObject({ driverError: { constraint: 'category_parent_shop_fk' } });
  });

  it('rejects duplicate sibling names but allows the same name in another branch', async () => {
    await expect(
      source.getRepository(CategoryModel).insert({ shopUuid, parentUuid: rootUuid, name: 'кружки' }),
    ).rejects.toMatchObject({ driverError: { constraint: 'category_sibling_name_uq' } });
    await source.getRepository(CategoryModel).insert({ shopUuid, parentUuid: null, name: 'Кружки', sortOrder: 2 });
    await expect(
      source.getRepository(CategoryModel).insert({ shopUuid, parentUuid: null, name: 'ПОСУДА' }),
    ).rejects.toMatchObject({ driverError: { constraint: 'category_root_name_uq' } });
  });

  it('rejects self-parenting and deletion of a parent with descendants', async () => {
    await expect(source.getRepository(CategoryModel).update(rootUuid, { parentUuid: rootUuid })).rejects.toMatchObject({
      driverError: { constraint: 'category_parent_ck' },
    });
    await expect(source.getRepository(CategoryModel).delete(rootUuid)).rejects.toMatchObject({
      driverError: { constraint: 'category_parent_shop_fk' },
    });
  });

  it('reports a corrupted cyclic tree instead of returning incomplete data', async () => {
    await source.getRepository(CategoryModel).update(rootUuid, { parentUuid: leafUuid });
    try {
      await expect(service.getTree(shopUuid)).rejects.toThrow('Category tree contains a cycle');
    } finally {
      await source.getRepository(CategoryModel).update(rootUuid, { parentUuid: null });
    }
  });

  const create = (name: string, parentUuid: string | null = null) =>
    service.create({ commandId: randomUUID(), shopUuid, parentUuid, name, description: null });

  it('creates once per command id, trims the name and records an outbox event', async () => {
    const input = {
      commandId: randomUUID(),
      shopUuid,
      parentUuid: null,
      name: '  Новая категория  ',
      description: null,
    };
    const first = await service.create(input);
    const replay = await service.create(input);
    expect(replay.uuid).toBe(first.uuid);
    expect(first).toMatchObject({ name: 'Новая категория', parentUuid: null, version: 1, shopUuid });
    const events = await source.query(
      'SELECT event_type, aggregate_version FROM outbox_event WHERE aggregate_uuid = $1',
      [first.uuid],
    );
    expect(events).toEqual([{ event_type: 'store.category.created', aggregate_version: 1 }]);
    await expect(service.create({ ...input, name: 'Другой запрос' })).rejects.toThrow('Command id was already used');
  });

  it('changes fields and parent atomically, appends to siblings, and preserves descendants', async () => {
    const category = await create('Переносимая категория');
    const child = await create('Вложенная категория', category.uuid);
    const updated = await service.update({
      commandId: randomUUID(),
      uuid: category.uuid,
      expectedVersion: 1,
      name: 'После переноса',
      description: 'Описание',
      parentUuid: rootUuid,
    });
    expect(updated).toMatchObject({
      version: 2,
      parentUuid: rootUuid,
      name: 'После переноса',
      description: 'Описание',
    });
    expect(updated.sortOrder).toBeGreaterThan(0);
    await expect(service.getByUuid(child.uuid)).resolves.toMatchObject({ parentUuid: category.uuid });
    await expect(
      service.update({
        commandId: randomUUID(),
        uuid: category.uuid,
        expectedVersion: 1,
        name: 'Старая версия',
        description: null,
        parentUuid: null,
      }),
    ).rejects.toThrow('уже изменена');
    await expect(service.getByUuid(category.uuid)).resolves.toMatchObject({
      version: 2,
      name: 'После переноса',
      parentUuid: rootUuid,
    });
  });

  it('rejects foreign parents, cycles, empty names and duplicates without partial writes', async () => {
    const category = await create('Защищённая категория');
    const child = await create('Потомок', category.uuid);
    const input = {
      commandId: randomUUID(),
      uuid: category.uuid,
      expectedVersion: 1,
      name: 'Недопустимая правка',
      description: null,
      parentUuid: child.uuid,
    };
    await expect(service.update(input)).rejects.toThrow('своего потомка');
    await expect(service.update({ ...input, commandId: randomUUID(), parentUuid: category.uuid })).rejects.toThrow(
      'себя',
    );
    const foreign = await service.create({
      commandId: randomUUID(),
      shopUuid: otherShopUuid,
      parentUuid: null,
      name: 'Чужая категория',
      description: null,
    });
    await expect(service.update({ ...input, commandId: randomUUID(), parentUuid: foreign.uuid })).rejects.toThrow(
      'этому магазину',
    );
    await expect(create('   ')).rejects.toThrow();
    await expect(create('защищённая категория')).rejects.toThrow('уже существует');
    await expect(service.getByUuid(category.uuid)).resolves.toMatchObject({
      name: category.name,
      version: 1,
      parentUuid: null,
    });
    const events = await source.query('SELECT uuid FROM outbox_event WHERE aggregate_uuid = $1', [category.uuid]);
    expect(events).toHaveLength(1);
  });

  it('serializes concurrent opposite moves so they cannot create a cycle', async () => {
    const left = await create('Параллельная А');
    const right = await create('Параллельная Б');
    const outcomes = await Promise.allSettled([
      service.update({
        commandId: randomUUID(),
        uuid: left.uuid,
        expectedVersion: 1,
        name: left.name,
        description: null,
        parentUuid: right.uuid,
      }),
      service.update({
        commandId: randomUUID(),
        uuid: right.uuid,
        expectedVersion: 1,
        name: right.name,
        description: null,
        parentUuid: left.uuid,
      }),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
    await expect(service.getTree(shopUuid)).resolves.toHaveProperty('nodes');
  });
});
