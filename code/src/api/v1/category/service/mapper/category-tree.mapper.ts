import { InternalServerErrorException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';

import { CategoryModel } from '../../model/category.model';
import { CategoryNodeEntity } from '../../entity/category-node.entity';
import { CategoryTreeEntity } from '../../entity/category-tree.entity';

export class CategoryTreeMapper {
  static map(shopUuid: string, categories: CategoryModel[]): CategoryTreeEntity {
    const byUuid = new Map<string, CategoryNodeEntity>();
    const nodes: CategoryNodeEntity[] = [];

    for (const category of categories) {
      if (category.shopUuid !== shopUuid || byUuid.has(category.uuid)) {
        throw new InternalServerErrorException('Invalid category tree');
      }
      byUuid.set(
        category.uuid,
        plainToInstance(
          CategoryNodeEntity,
          {
            ...category,
            createdAt: category.createdAt.toISOString(),
            updatedAt: category.updatedAt.toISOString(),
            children: [],
          },
          { excludeExtraneousValues: true },
        ),
      );
    }

    for (const node of byUuid.values()) {
      if (node.parentUuid === null) nodes.push(node);
      else {
        const parent = byUuid.get(node.parentUuid);
        if (!parent) throw new InternalServerErrorException('Missing category parent');
        parent.children.push(node);
      }
    }

    let visited = 0;
    const pending = [...nodes];
    while (pending.length > 0) {
      const node = pending.pop();
      if (!node) break;
      visited++;
      pending.push(...node.children);
    }
    if (visited !== categories.length) throw new InternalServerErrorException('Category tree contains a cycle');

    return plainToInstance(CategoryTreeEntity, { shopUuid, nodes }, { excludeExtraneousValues: true });
  }
}
