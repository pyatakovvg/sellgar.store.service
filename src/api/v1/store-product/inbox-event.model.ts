import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('inbox_event')
@Index(['aggregateType', 'aggregateUuid', 'aggregateVersion'])
export class InboxEventModel {
  @PrimaryColumn('uuid', { name: 'event_uuid' })
  eventUuid: string;

  @Column({ name: 'producer', type: 'varchar', length: 128 })
  producer: string;

  @Column({ name: 'schema_version', type: 'int' })
  schemaVersion: number;

  @Column({ name: 'event_type', type: 'varchar', length: 128 })
  eventType: string;

  @Column({ name: 'aggregate_type', type: 'varchar', length: 128 })
  aggregateType: string;

  @Column({ name: 'aggregate_uuid', type: 'uuid' })
  aggregateUuid: string;

  @Column({ name: 'aggregate_version', type: 'int' })
  aggregateVersion: number;

  @CreateDateColumn({ name: 'received_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  receivedAt: Date;

  @Column({ name: 'processed_at', type: 'timestamp', nullable: true })
  processedAt?: Date | null;

  @Column({ name: 'status', type: 'varchar', length: 64, default: 'received' })
  status: string;

  @Column({ name: 'attempts', type: 'int', default: 0 })
  attempts: number;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError?: string | null;
}
