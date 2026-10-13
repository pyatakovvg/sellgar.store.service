import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { AccountingRecordModel } from './accounting-record.model';

@Entity('record_clarification')
@Check('record_clarification_position_ck', 'position >= 0')
@Check('record_clarification_value_ck', 'length(btrim(value)) > 0')
export class RecordClarificationModel {
  @PrimaryColumn({ name: 'record_uuid', type: 'uuid' })
  recordUuid: string;
  @PrimaryColumn({ type: 'int' })
  position: number;
  @Column({ type: 'text' })
  value: string;
  @JoinColumn({ name: 'record_uuid', foreignKeyConstraintName: 'record_clarification_record_fk' })
  @ManyToOne(() => AccountingRecordModel, (record) => record.clarifications, { onDelete: 'CASCADE' })
  record: AccountingRecordModel;
}
