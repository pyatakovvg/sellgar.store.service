import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  Generated,
  UpdateDateColumn,
} from 'typeorm';

import { StoreOfferModel } from './store-offer.model';
import { StoreProductStatus } from '../enum/store-product-status.enum';

import { ProductSnapshotModel } from './product-snapshot.model';
import { ShopSnapshotModel } from './shop-snapshot.model';

@Index(['uuid', 'productUuid'], { unique: true })
@Entity('store_product')
export class StoreProductModel {
  @Generated('uuid')
  @PrimaryColumn('uuid', { name: 'uuid', default: () => 'gen_random_uuid()' })
  uuid: string;

  @Column({ name: 'version', type: 'int', default: 1 })
  version: number;

  @Index()
  @Column({ name: 'shop_uuid', type: 'uuid' })
  shopUuid: string;

  @Index()
  @Column({ name: 'product_uuid', type: 'uuid' })
  productUuid: string;

  @JoinColumn({
    name: 'product_uuid',
    referencedColumnName: 'productUuid',
    foreignKeyConstraintName: 'store_product_product_fk',
  })
  @ManyToOne(() => ProductSnapshotModel, { onDelete: 'RESTRICT' })
  product: ProductSnapshotModel;

  @JoinColumn({
    name: 'shop_uuid',
    referencedColumnName: 'shopUuid',
    foreignKeyConstraintName: 'store_product_shop_fk',
  })
  @ManyToOne(() => ShopSnapshotModel, { onDelete: 'RESTRICT' })
  shop: ShopSnapshotModel;

  @Column({ name: 'status', type: 'enum', enum: StoreProductStatus, default: StoreProductStatus.ACTIVE })
  status: StoreProductStatus;

  @Column({ name: 'showing', type: 'boolean', default: true })
  showing: boolean;

  @OneToMany(() => StoreOfferModel, (offer) => offer.storeProduct)
  offers: StoreOfferModel[];

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp',
    comment: 'дата создания',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamp',
    comment: 'дата обновления',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updatedAt: Date;
}
