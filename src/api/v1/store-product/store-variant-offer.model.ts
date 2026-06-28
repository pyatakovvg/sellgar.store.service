import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryColumn, UpdateDateColumn } from 'typeorm';

import { InventoryModel } from './inventory.model';
import { PriceHistoryModel } from './price-history.model';
import { StoreProductModel } from './store-product.model';
import { StoreProductStatus } from './store-product-status.enum';
import { VariantSnapshotModel } from './variant-snapshot.model';

@Index(['storeProductUuid', 'variantUuid'], { unique: true })
@Entity('store_variant_offer')
export class StoreVariantOfferModel {
  @PrimaryColumn('uuid', { name: 'uuid', default: () => 'gen_random_uuid()' })
  uuid: string;

  @Column({ name: 'version', type: 'int', default: 1 })
  version: number;

  @Column({ name: 'store_product_uuid', type: 'uuid' })
  storeProductUuid: string;

  @JoinColumn({ name: 'store_product_uuid' })
  @ManyToOne(() => StoreProductModel, (storeProduct) => storeProduct.offers, { onDelete: 'CASCADE' })
  storeProduct: StoreProductModel;

  @Index()
  @Column({ name: 'variant_uuid', type: 'uuid' })
  variantUuid: string;

  @JoinColumn({ name: 'variant_uuid' })
  @ManyToOne(() => VariantSnapshotModel, { onDelete: 'RESTRICT' })
  variantSnapshot: VariantSnapshotModel;

  @Column({ name: 'sku', type: 'varchar', length: 256, nullable: true })
  sku?: string | null;

  @Column({ name: 'article', type: 'varchar', length: 256, nullable: true })
  article?: string | null;

  @Column({ name: 'title_override', type: 'varchar', length: 512, nullable: true })
  titleOverride?: string | null;

  @Column({ name: 'description_override', type: 'text', nullable: true })
  descriptionOverride?: string | null;

  @Column({ name: 'status', type: 'enum', enum: StoreProductStatus, default: StoreProductStatus.ACTIVE })
  status: StoreProductStatus;

  @Column({ name: 'showing', type: 'boolean', default: true })
  showing: boolean;

  @OneToMany(() => PriceHistoryModel, (price) => price.offer)
  prices: PriceHistoryModel[];

  @OneToMany(() => InventoryModel, (inventory) => inventory.offer)
  inventory: InventoryModel[];

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
