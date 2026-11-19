import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { CategoryPathEntity } from '../../category/entity/category-path.entity';
import { StoreProductCategoryModel } from '../model/store-product-category.model';

@Injectable()
export class StoreProductCategoryRepository {
  async getPaths(manager: EntityManager, storeProductUuid: string): Promise<CategoryPathEntity[]> {
    return manager.query(
      `WITH RECURSIVE paths AS (
        SELECT link.category_uuid, category.uuid, category.parent_uuid, category.shop_uuid,
          jsonb_build_array(jsonb_build_object('uuid', category.uuid, 'name', category.name)) AS items,
          ARRAY[category.uuid] AS visited
        FROM store_product_category link
        JOIN category ON category.uuid = link.category_uuid AND category.shop_uuid = link.shop_uuid
        WHERE link.store_product_uuid = $1
        UNION ALL
        SELECT paths.category_uuid, parent.uuid, parent.parent_uuid, parent.shop_uuid,
          jsonb_build_array(jsonb_build_object('uuid', parent.uuid, 'name', parent.name)) || paths.items,
          paths.visited || parent.uuid
        FROM paths
        JOIN category parent ON parent.uuid = paths.parent_uuid AND parent.shop_uuid = paths.shop_uuid
        WHERE NOT parent.uuid = ANY(paths.visited)
      )
      SELECT category_uuid AS "categoryUuid", items FROM paths
      WHERE parent_uuid IS NULL ORDER BY category_uuid`,
      [storeProductUuid],
    );
  }

  async synchronize(
    manager: EntityManager,
    storeProductUuid: string,
    shopUuid: string,
    categoryUuids: string[],
  ): Promise<void> {
    // The category writer uses the same shop lock: a selected leaf cannot become a branch concurrently.
    await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [shopUuid]);
    if (categoryUuids.length > 0) {
      const categories = await manager.query(
        `
        SELECT c.uuid FROM category c WHERE c.shop_uuid = $1 AND c.uuid = ANY($2::uuid[])
        AND NOT EXISTS (SELECT 1 FROM category child WHERE child.parent_uuid = c.uuid AND child.shop_uuid = c.shop_uuid)
      `,
        [shopUuid, categoryUuids],
      );
      if (categories.length !== categoryUuids.length) {
        throw new BadRequestException('Выберите конечные категории этого магазина.');
      }
    }
    await manager.delete(StoreProductCategoryModel, { storeProductUuid });
    if (categoryUuids.length > 0) {
      await manager.insert(
        StoreProductCategoryModel,
        categoryUuids.map((categoryUuid) => ({ storeProductUuid, shopUuid, categoryUuid })),
      );
    }
  }
}
