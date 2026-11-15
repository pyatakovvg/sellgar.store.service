import { Injectable, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { CategoryEntity } from '../entity/category.entity';
import { DataSource } from 'typeorm';

import { ShopSnapshotModel } from '../../store-product/model/shop-snapshot.model';
import { CategoryModel } from '../model/category.model';

@Injectable()
export class CategoryRepository {
  constructor(private readonly source: DataSource) {}

  async getByUuid(uuid: string): Promise<CategoryEntity> {
    const category = await this.source.getRepository(CategoryModel).findOneBy({ uuid });
    if (!category) throw new NotFoundException('Категория не найдена.');
    return plainToInstance(
      CategoryEntity,
      { ...category, createdAt: category.createdAt.toISOString(), updatedAt: category.updatedAt.toISOString() },
      { excludeExtraneousValues: true },
    );
  }

  async getAll(shopUuid: string): Promise<CategoryModel[]> {
    const shopExists = await this.source.getRepository(ShopSnapshotModel).existsBy({ shopUuid });
    if (!shopExists) throw new NotFoundException('Shop not found');

    return this.source.getRepository(CategoryModel).find({
      where: { shopUuid },
      order: { sortOrder: 'ASC', uuid: 'ASC' },
    });
  }
}
