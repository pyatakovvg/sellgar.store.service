import 'reflect-metadata';
import { isUUID } from 'class-validator';

import source from '../data-source';
import { CategoryModel } from '../../api/v1/category/model/category.model';
import { ShopSnapshotModel } from '../../api/v1/store-product/model/shop-snapshot.model';
import { createCategoryTreeExample } from './category-examples';

async function seed(): Promise<void> {
  const shopUuid = process.argv[2];
  if (!isUUID(shopUuid)) throw new Error('Usage: yarn seed:categories <shopUuid>');
  await source.initialize();

  try {
    await source.transaction(async (manager) => {
      const shop = await manager.getRepository(ShopSnapshotModel).findOneBy({ shopUuid });
      if (!shop) throw new Error('Shop snapshot not found');
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [shopUuid]);
      if (await manager.getRepository(CategoryModel).existsBy({ shopUuid })) {
        console.log('Shop already has categories; no changes made.');
        return;
      }

      const pending = [...createCategoryTreeExample(shopUuid).nodes].reverse();
      let count = 0;
      while (pending.length > 0) {
        const node = pending.pop();
        if (!node) break;
        const { children, createdAt, updatedAt, ...category } = node;
        await manager
          .getRepository(CategoryModel)
          .insert({ ...category, createdAt: new Date(createdAt), updatedAt: new Date(updatedAt) });
        count++;
        pending.push(...[...children].reverse());
      }
      console.log(`Created ${count} categories for shop ${shopUuid}.`);
    });
  } finally {
    await source.destroy();
  }
}
void seed().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Category seed failed');
  process.exitCode = 1;
});
