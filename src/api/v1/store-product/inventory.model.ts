import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';

import { StoreOfferModel } from './store-offer.model';

@Entity('inventory')
export class InventoryModel {
  @PrimaryColumn('uuid', { name: 'uuid', default: () => 'gen_random_uuid()' })
  uuid: string;

  @Column({ name: 'offer_uuid', type: 'uuid' })
  offerUuid: string;

  @JoinColumn({ name: 'offer_uuid' })
  @ManyToOne(() => StoreOfferModel, (offer) => offer.inventory, { onDelete: 'CASCADE' })
  offer: StoreOfferModel;

  @Column({ name: 'quantity', type: 'int', default: 0 })
  quantity: number;

  @Column({ name: 'reserved', type: 'int', default: 0 })
  reserved: number;

  @Column({ name: 'version', type: 'int', default: 1 })
  version: number;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamp',
    comment: 'дата обновления',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updatedAt: Date;
}
