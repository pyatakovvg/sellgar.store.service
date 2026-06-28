import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('shop_snapshot')
export class ShopSnapshotModel {
  @PrimaryColumn('uuid', { name: 'shop_uuid' })
  shopUuid: string;

  @Column({ name: 'source_version', type: 'int' })
  sourceVersion: number;

  @Column({ name: 'name', type: 'varchar', length: 512 })
  name: string;

  @Column({ name: 'status', type: 'varchar', length: 64 })
  status: string;

  @Column({ name: 'synced_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  syncedAt: Date;
}
