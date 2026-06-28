import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

import { InventoryMovementModel } from './inventory-movement.model';
import { OfferInventoryModel } from './offer-inventory.model';
import { PriceHistoryModel } from './price-history.model';
import { StoreProductModel } from './store-product.model';
import { StoreOfferStatus } from './store-offer-status.enum';
import { VariantSnapshotModel } from './variant-snapshot.model';

@Index(['storeProductUuid', 'variantUuid'], { unique: true })
@Entity('store_offer')
export class StoreOfferModel {
  @PrimaryColumn('uuid', { name: 'uuid', default: () => 'gen_random_uuid()' })
  uuid: string;

  @Column({ name: 'version', type: 'int', default: 1 })
  version: number;

  @Column({ name: 'store_product_uuid', type: 'uuid' })
  storeProductUuid: string;

  @Column({ name: 'product_uuid', type: 'uuid' })
  productUuid: string;

  @JoinColumn([
    { name: 'store_product_uuid', referencedColumnName: 'uuid' },
    { name: 'product_uuid', referencedColumnName: 'productUuid' },
  ])
  @ManyToOne(() => StoreProductModel, (storeProduct) => storeProduct.offers, { onDelete: 'CASCADE' })
  storeProduct: StoreProductModel;

  @Index()
  @Column({ name: 'variant_uuid', type: 'uuid' })
  variantUuid: string;

  @JoinColumn([
    { name: 'product_uuid', referencedColumnName: 'productUuid' },
    { name: 'variant_uuid', referencedColumnName: 'variantUuid' },
  ])
  @ManyToOne(() => VariantSnapshotModel, { onDelete: 'RESTRICT' })
  variantSnapshot: VariantSnapshotModel;

  @Column({ name: 'article', type: 'varchar', length: 256, nullable: true })
  article?: string | null;

  @Column({ name: 'status', type: 'enum', enum: StoreOfferStatus, default: StoreOfferStatus.ACTIVE })
  status: StoreOfferStatus;

  @Column({ name: 'showing', type: 'boolean', default: true })
  showing: boolean;

  @OneToMany(() => PriceHistoryModel, (price) => price.offer)
  prices: PriceHistoryModel[];

  @OneToOne(() => OfferInventoryModel, (inventory) => inventory.offer)
  inventory?: OfferInventoryModel | null;

  @OneToMany(() => InventoryMovementModel, (movement) => movement.offer)
  inventoryMovements: InventoryMovementModel[];

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
