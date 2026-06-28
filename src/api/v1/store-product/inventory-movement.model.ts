import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';

import { InventoryMovementSourceType } from './inventory-movement-source-type.enum';
import { InventoryMovementType } from './inventory-movement-type.enum';
import { StoreOfferModel } from './store-offer.model';

@Index(['offerUuid'])
@Entity('inventory_movement')
export class InventoryMovementModel {
  @PrimaryColumn('uuid', { name: 'uuid', default: () => 'gen_random_uuid()' })
  uuid: string;

  @Column({ name: 'offer_uuid', type: 'uuid' })
  offerUuid: string;

  @JoinColumn({ name: 'offer_uuid' })
  @ManyToOne(() => StoreOfferModel, (offer) => offer.inventoryMovements, { onDelete: 'CASCADE' })
  offer: StoreOfferModel;

  @Column({ name: 'type', type: 'enum', enum: InventoryMovementType })
  type: InventoryMovementType;

  @Column({ name: 'quantity_delta', type: 'int', default: 0 })
  quantityDelta: number;

  @Column({ name: 'reserved_delta', type: 'int', default: 0 })
  reservedDelta: number;

  @Column({
    name: 'source_type',
    type: 'enum',
    enum: InventoryMovementSourceType,
    default: InventoryMovementSourceType.MANUAL,
  })
  sourceType: InventoryMovementSourceType;

  @Column({ name: 'source_uuid', type: 'uuid', nullable: true })
  sourceUuid?: string | null;

  @Column({ name: 'reason', type: 'varchar', length: 512, nullable: true })
  reason?: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
