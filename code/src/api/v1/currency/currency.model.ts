import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('currency')
export class CurrencyModel {
  @PrimaryColumn('varchar', { name: 'code', length: 3 })
  code: string;

  @Column({ name: 'value', type: 'varchar', length: 64 })
  value: string;

  @Column({ name: 'order', type: 'int', default: 0 })
  order: number;

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
