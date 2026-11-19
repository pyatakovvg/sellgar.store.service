const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const amqp = require('amqplib');
const { Client } = require('pg');
const { ClientProxyFactory, Transport } = require('@nestjs/microservices');
const { firstValueFrom, timeout } = require('rxjs');

const client = ClientProxyFactory.create({
  transport: Transport.RMQ,
  options: {
    urls: ['amqp://smoke:smoke@broker:5672'],
    queue: 'store_srv.command.queue',
    queueOptions: { durable: true },
  },
});
const request = (cmd, data) => firstValueFrom(client.send({ cmd }, data).pipe(timeout(5000)));
const pause = () => new Promise((resolve) => setTimeout(resolve, 250));

(async () => {
  let broker;
  const database = new Client({ host: 'database', user: 'store_srv', password: 'smoke', database: 'store_srv' });
  try {
    await database.connect();
    broker = await amqp.connect('amqp://smoke:smoke@broker:5672');
    const channel = await broker.createConfirmChannel();
    const queue = await channel.assertQueue('', { exclusive: true });
    await channel.bindQueue(queue.queue, 'event.exchange', 'store.product.*');
    await channel.bindQueue(queue.queue, 'event.exchange', 'store.inventory.updated');
    const events = [];
    await channel.consume(
      queue.queue,
      (message) => {
        if (message) events.push(JSON.parse(message.content.toString()).data);
      },
      { noAck: true },
    );
    assert.equal((await request('store.product.getAll', { query: {} })).data.length, 0);
    const shopUuid = randomUUID(),
      productUuid = randomUUID(),
      variantUuid = randomUUID();
    const publish = (producer, aggregateType, aggregateId, payload, schemaVersion) => {
      const eventType = aggregateType + '.created';
      const data = {
        eventUuid: randomUUID(),
        producer,
        aggregateType,
        aggregateId,
        aggregateVersion: 1,
        eventType,
        schemaVersion,
        payload,
        occurredAt: new Date().toISOString(),
      };
      channel.publish('event.exchange', eventType, Buffer.from(JSON.stringify({ pattern: eventType, data })), {
        persistent: true,
      });
    };
    publish('shop_srv', 'shop', shopUuid, { uuid: shopUuid, version: 1, name: 'Smoke shop' }, 1);
    publish(
      'product_srv_v2',
      'product',
      productUuid,
      {
        uuid: productUuid,
        version: 1,
        name: 'Smoke product',
        status: 'active',
        variants: [{ uuid: variantUuid, name: 'Blue', status: 'active' }],
      },
      3,
    );
    await channel.waitForConfirms();
    for (let attempt = 0; attempt < 40; attempt++) {
      const { rows } = await database.query(
        'SELECT (SELECT count(*) FROM shop_snapshot) + (SELECT count(*) FROM product_snapshot) AS n',
      );
      if (Number(rows[0].n) === 2) break;
      await pause();
    }
    await request('currency.create', { code: 'RUB', value: 'Российский рубль', order: 0 });
    const root = await request('store.category.create', {
      commandId: randomUUID(),
      shopUuid,
      parentUuid: null,
      name: 'Clothing',
      description: null,
    });
    const leaf = await request('store.category.create', {
      commandId: randomUUID(),
      shopUuid,
      parentUuid: root.uuid,
      name: 'Shirts',
      description: null,
    });
    const tree = await request('store.category.getTree', { shopUuid });
    assert.equal(tree.nodes[0].children[0].uuid, leaf.uuid);
    const input = {
      commandId: randomUUID(),
      shopUuid,
      productUuid,
      showing: true,
      categoryUuids: [leaf.uuid],
      offers: [
        {
          variantUuid,
          showing: true,
          currentPrice: { value: '1500.50', currencyCode: 'RUB' },
          records: [
            { article: 'SMOKE-S', order: 0, clarifications: [{ value: 'S' }] },
            { article: 'SMOKE-M', order: 1, clarifications: [{ value: 'M' }] },
          ],
        },
      ],
    };
    const created = await request('store.product.create', input);
    assert.equal((await request('store.product.create', input)).uuid, created.uuid);
    assert.equal(created.version, 1);
    assert.equal(created.offers[0].currentPrice.value, '1500.50');
    assert.deepEqual(
      created.offers[0].records.map((record) => record.order),
      [0, 1],
    );
    const record = created.offers[0].records[0];
    const receipt = {
      commandId: randomUUID(),
      recordUuid: record.uuid,
      expectedVersion: record.inventory.version,
      quantity: 5,
      reason: 'Deployment smoke',
    };
    const inventory = await request('store.inventory.receipt', receipt);
    assert.equal(inventory.quantity, 5);
    assert.equal((await request('store.inventory.receipt', receipt)).quantity, 5);
    await assert.rejects(
      request('store.inventory.receipt', { ...receipt, commandId: randomUUID() }),
      (e) => e.statusCode === 409,
    );
    const card = await request('store.offer.getByUuid', { uuid: created.offers[0].uuid, query: {} });
    assert.deepEqual(
      card.categories[0].items.map((item) => item.name),
      ['Clothing', 'Shirts'],
    );
    const updated = await request('store.product.update', {
      commandId: randomUUID(),
      uuid: created.uuid,
      expectedVersion: 1,
      showing: false,
    });
    assert.equal(updated.version, 2);
    assert.equal(updated.offers[0].records[0].inventory.quantity, 5);
    assert.equal((await request('store.product.getAll', { query: { search: 'SMOKE-S' } })).data[0].uuid, created.uuid);
    assert.equal((await request('store.product.getAll', { query: { productShowing: true } })).data.length, 0);
    await assert.rejects(
      request('store.product.update', {
        commandId: randomUUID(),
        uuid: created.uuid,
        expectedVersion: 1,
        showing: true,
      }),
      (e) => e.statusCode === 409,
    );
    for (let attempt = 0; attempt < 40 && events.length < 3; attempt++) await pause();
    assert.deepEqual(
      events.filter((event) => event.aggregateType === 'store_product').map((event) => event.aggregateVersion),
      [1, 2],
    );
    assert.equal(events.find((event) => event.eventType === 'store.inventory.updated').payload.quantity, 5);
    console.log(
      'Store: snapshots/inbox, categories, prices, ordered records, inventory/idempotency/409, search and outbox passed',
    );
  } finally {
    await client.close();
    if (broker) await broker.close();
    await database.end();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
