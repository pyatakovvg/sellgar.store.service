import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Generated,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

import { ShopSnapshotModel } from '../../store-product/model/shop-snapshot.model';

@Entity('category')
@Unique('category_uuid_shop_uq', ['uuid', 'shopUuid'])
@Index('category_tree_idx', ['shopUuid', 'parentUuid', 'sortOrder', 'uuid'])
@Index('category_root_name_uq', { synchronize: false })
@Index('category_sibling_name_uq', { synchronize: false })
@Check('category_name_ck', 'length(btrim(name)) > 0 AND name = btrim(name)')
@Check('category_version_ck', 'version >= 1')
@Check('category_sort_order_ck', 'sort_order >= 0')
@Check('category_parent_ck', 'parent_uuid IS NULL OR parent_uuid <> uuid')
export class CategoryModel {
  @Generated('uuid')
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  uuid: string;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ name: 'shop_uuid', type: 'uuid' })
  shopUuid: string;

  @ManyToOne(() => ShopSnapshotModel, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'shop_uuid', referencedColumnName: 'shopUuid', foreignKeyConstraintName: 'category_shop_fk' })
  shop: ShopSnapshotModel;

  @Column({ name: 'parent_uuid', type: 'uuid', nullable: true })
  parentUuid: string | null;

  @ManyToOne(() => CategoryModel, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'parent_uuid', referencedColumnName: 'uuid', foreignKeyConstraintName: 'category_parent_shop_fk' },
    { name: 'shop_uuid', referencedColumnName: 'shopUuid', foreignKeyConstraintName: 'category_parent_shop_fk' },
  ])
  parent: CategoryModel | null;

  @Column({ type: 'varchar', length: 512 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
