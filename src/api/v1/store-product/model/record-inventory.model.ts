import { Generated, Check, Column, Entity, JoinColumn, OneToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';

import { AccountingRecordModel } from './accounting-record.model';

@Entity('record_inventory')
@Check('record_inventory_quantity_ck', 'quantity >= 0 AND reserved >= 0 AND reserved <= quantity')
export class RecordInventoryModel {
  @Generated('uuid')
  @PrimaryColumn('uuid', { name: 'uuid', default: () => 'gen_random_uuid()' })
  uuid: string;

  @Column({ name: 'record_uuid', type: 'uuid' })
  recordUuid: string;

  @JoinColumn({ name: 'record_uuid' })
  @OneToOne(() => AccountingRecordModel, (record) => record.inventory, { onDelete: 'RESTRICT' })
  record: AccountingRecordModel;

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
