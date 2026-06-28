import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryColumn, UpdateDateColumn } from 'typeorm';

import { StoreVariantOfferModel } from './store-variant-offer.model';
import { StoreProductStatus } from './store-product-status.enum';

@Entity('store_product')
export class StoreProductModel {
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

  @Column({ name: 'article', type: 'varchar', length: 256 })
  article: string;

  @Column({ name: 'title_override', type: 'varchar', length: 512, nullable: true })
  titleOverride?: string | null;

  @Column({ name: 'description_override', type: 'text', nullable: true })
  descriptionOverride?: string | null;

  @Column({ name: 'status', type: 'enum', enum: StoreProductStatus, default: StoreProductStatus.ACTIVE })
  status: StoreProductStatus;

  @Column({ name: 'showing', type: 'boolean', default: true })
  showing: boolean;

  @OneToMany(() => StoreVariantOfferModel, (offer) => offer.storeProduct)
  offers: StoreVariantOfferModel[];

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
