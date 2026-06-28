import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('sync_issue')
export class SyncIssueModel {
  @PrimaryColumn('uuid', { name: 'uuid', default: () => 'gen_random_uuid()' })
  uuid: string;

  @Column({ name: 'producer', type: 'varchar', length: 128 })
  producer: string;

  @Column({ name: 'aggregate_type', type: 'varchar', length: 128 })
  aggregateType: string;

  @Column({ name: 'aggregate_uuid', type: 'uuid' })
  aggregateUuid: string;

  @Column({ name: 'expected_version', type: 'int', nullable: true })
  expectedVersion?: number | null;

  @Column({ name: 'received_version', type: 'int' })
  receivedVersion: number;

  @Column({ name: 'event_uuid', type: 'uuid' })
  eventUuid: string;

  @Column({ name: 'reason', type: 'varchar', length: 128 })
  reason: string;

  @Column({ name: 'payload', type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ name: 'status', type: 'varchar', length: 64, default: 'open' })
  status: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ name: 'resolved_at', type: 'timestamp', nullable: true })
  resolvedAt?: Date | null;
}
