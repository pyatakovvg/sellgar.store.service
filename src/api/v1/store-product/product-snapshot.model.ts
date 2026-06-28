import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('product_snapshot')
export class ProductSnapshotModel {
  @PrimaryColumn('uuid', { name: 'product_uuid' })
  productUuid: string;

  @Column({ name: 'source_version', type: 'int' })
  sourceVersion: number;

  @Column({ name: 'name', type: 'varchar', length: 256 })
  name: string;

  @Column({ name: 'status', type: 'varchar', length: 64 })
  status: string;

  @Column({ name: 'synced_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  syncedAt: Date;
}
