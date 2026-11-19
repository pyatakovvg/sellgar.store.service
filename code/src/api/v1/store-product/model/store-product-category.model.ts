import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';

import { CategoryModel } from '../../category/model/category.model';
import { StoreProductModel } from './store-product.model';

@Entity('store_product_category')
@Index('store_product_category_category_idx', ['categoryUuid', 'shopUuid'])
export class StoreProductCategoryModel {
  @PrimaryColumn('uuid', { name: 'store_product_uuid', primaryKeyConstraintName: 'store_product_category_pkey' })
  storeProductUuid: string;

  @PrimaryColumn('uuid', { name: 'category_uuid', primaryKeyConstraintName: 'store_product_category_pkey' })
  categoryUuid: string;

  @Column('uuid', { name: 'shop_uuid' })
  shopUuid: string;

  @ManyToOne(() => StoreProductModel, (product) => product.categoryLinks, { onDelete: 'CASCADE' })
  @JoinColumn([
    {
      name: 'store_product_uuid',
      referencedColumnName: 'uuid',
      foreignKeyConstraintName: 'store_product_category_product_fk',
    },
    {
      name: 'shop_uuid',
      referencedColumnName: 'shopUuid',
      foreignKeyConstraintName: 'store_product_category_product_fk',
    },
  ])
  storeProduct: StoreProductModel;

  @ManyToOne(() => CategoryModel, { onDelete: 'RESTRICT' })
  @JoinColumn([
    {
      name: 'category_uuid',
      referencedColumnName: 'uuid',
      foreignKeyConstraintName: 'store_product_category_category_fk',
    },
    {
      name: 'shop_uuid',
      referencedColumnName: 'shopUuid',
      foreignKeyConstraintName: 'store_product_category_category_fk',
    },
  ])
  category: CategoryModel;
}
