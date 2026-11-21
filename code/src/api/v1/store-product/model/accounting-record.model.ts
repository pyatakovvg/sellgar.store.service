import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryColumn,
  Generated,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { PriceHistoryModel } from './price-history.model';
import { StoreOfferModel } from './store-offer.model';
import { RecordClarificationModel } from './record-clarification.model';
import { RecordInventoryModel } from './record-inventory.model';
import { InventoryMovementModel } from './inventory-movement.model';

@Entity('accounting_record')
@Check('accounting_record_order_ck', '"order" >= 0')
@Unique('accounting_record_offer_order_uq', ['offerUuid', 'order'], { deferrable: 'INITIALLY DEFERRED' })
@Check('accounting_record_article_ck', 'length(btrim(article)) > 0 AND article = btrim(article)')
@Index('accounting_record_article_uq', ['article'], { unique: true })
@Index('accounting_record_offer_idx', ['offerUuid'])
@Index('accounting_record_search_idx', { synchronize: false })
export class AccountingRecordModel {
  @Generated('uuid')
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  uuid: string;
  @Column({ name: 'offer_uuid', type: 'uuid' })
  offerUuid: string;
  @JoinColumn({ name: 'offer_uuid', foreignKeyConstraintName: 'accounting_record_offer_fk' })
  @ManyToOne(() => StoreOfferModel, (offer) => offer.records, { onDelete: 'RESTRICT' })
  offer: StoreOfferModel;
  @Column({ type: 'varchar', length: 256 })
  article: string;
  @Column({ type: 'int' })
  order: number;
  @Column({ name: 'search_vector', type: 'tsvector', select: false, insert: false, update: false })
  searchVector: string;
  @Column({ type: 'int', default: 1 })
  version: number;
  @OneToMany(() => RecordClarificationModel, (clarification) => clarification.record)
  clarifications: RecordClarificationModel[];
  @OneToMany(() => PriceHistoryModel, (price) => price.record)
  prices: PriceHistoryModel[];
  currentPrice?: PriceHistoryModel | null;
  @OneToOne(() => RecordInventoryModel, (inventory) => inventory.record)
  inventory: RecordInventoryModel;
  @OneToMany(() => InventoryMovementModel, (movement) => movement.record)
  inventoryMovements: InventoryMovementModel[];
  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
