import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';

import { CurrencyModel } from '../currency/currency.model';
import { StoreOfferModel } from './store-offer.model';

@Entity('price_history')
export class PriceHistoryModel {
  @PrimaryColumn('uuid', { name: 'uuid', default: () => 'gen_random_uuid()' })
  uuid: string;

  @Column({ name: 'offer_uuid', type: 'uuid' })
  offerUuid: string;

  @JoinColumn({ name: 'offer_uuid' })
  @ManyToOne(() => StoreOfferModel, (offer) => offer.prices, { onDelete: 'CASCADE' })
  offer: StoreOfferModel;

  @Column({ name: 'value', type: 'numeric', precision: 12, scale: 2, default: '0.00' })
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
