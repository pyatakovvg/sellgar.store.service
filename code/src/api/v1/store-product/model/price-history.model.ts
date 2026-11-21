import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn, Generated, Index } from 'typeorm';

import { CurrencyModel } from '../../currency/currency.model';
import { AccountingRecordModel } from './accounting-record.model';

@Index('price_history_record_created_idx', { synchronize: false })
@Entity('price_history')
export class PriceHistoryModel {
  @Generated('uuid')
  @PrimaryColumn('uuid', { name: 'uuid', default: () => 'gen_random_uuid()' })
  uuid: string;

  @Column({ name: 'record_uuid', type: 'uuid' })
  recordUuid: string;

  @JoinColumn({ name: 'record_uuid', foreignKeyConstraintName: 'price_history_record_fk' })
  @ManyToOne(() => AccountingRecordModel, (record) => record.prices, { onDelete: 'CASCADE' })
  record: AccountingRecordModel;

  @Column({ name: 'value', type: 'numeric', precision: 12, scale: 2, default: () => '0.00' })
  value: string;

  @Column({ name: 'currency_code', type: 'varchar', length: 3 })
  currencyCode: string;

  @JoinColumn({ name: 'currency_code' })
  @ManyToOne(() => CurrencyModel, (currency) => currency.code)
  currency: CurrencyModel;

  @Column({ name: 'starts_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  startsAt: Date;

  @Column({ name: 'ends_at', type: 'timestamp', nullable: true })
  endsAt?: Date | null;

  @Column({ name: 'reason', type: 'varchar', length: 512, nullable: true })
  reason?: string | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp',
    comment: 'дата создания',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;
}
