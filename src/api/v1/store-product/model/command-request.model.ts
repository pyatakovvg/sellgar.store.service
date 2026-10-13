import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('command_request')
export class CommandRequestModel {
  @PrimaryColumn('uuid', { name: 'command_id' })
  commandId: string;

  @Column({ name: 'command_type', type: 'varchar', length: 128 })
  commandType: string;

  @Column({ name: 'request_hash', type: 'varchar', length: 128 })
  requestHash: string;

  @Column({ name: 'status', type: 'varchar', length: 64 })
  status: string;

  @Column({ name: 'result', type: 'jsonb', nullable: true })
  result?: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updatedAt: Date;
}
