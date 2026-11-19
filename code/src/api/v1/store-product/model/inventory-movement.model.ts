import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, Generated } from 'typeorm';

import { InventoryMovementSourceType } from '../enum/inventory-movement-source-type.enum';
import { InventoryMovementType } from '../enum/inventory-movement-type.enum';
import { AccountingRecordModel } from './accounting-record.model';

@Index(['recordUuid'])
@Entity('inventory_movement')
export class InventoryMovementModel {
  @Generated('uuid')
  @PrimaryColumn('uuid', { name: 'uuid', default: () => 'gen_random_uuid()' })
  uuid: string;

  @Column({ name: 'record_uuid', type: 'uuid' })
  recordUuid: string;

  @JoinColumn({ name: 'record_uuid', foreignKeyConstraintName: 'inventory_movement_record_fk' })
  @ManyToOne(() => AccountingRecordModel, (record) => record.inventoryMovements, { onDelete: 'RESTRICT' })
  record: AccountingRecordModel;

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
