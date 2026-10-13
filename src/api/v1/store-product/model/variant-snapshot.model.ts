import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';

import { ProductSnapshotModel } from './product-snapshot.model';

@Entity('variant_snapshot')
@Index(['productUuid', 'variantUuid'], { unique: true })
export class VariantSnapshotModel {
  @PrimaryColumn('uuid', { name: 'variant_uuid' })
  variantUuid: string;

  @Index()
  @Column({ name: 'product_uuid', type: 'uuid' })
  productUuid: string;

  @JoinColumn({
    name: 'product_uuid',
    referencedColumnName: 'productUuid',
    foreignKeyConstraintName: 'variant_snapshot_product_fk',
  })
  @ManyToOne(() => ProductSnapshotModel, { onDelete: 'RESTRICT' })
  product: ProductSnapshotModel;

  @Column({ name: 'source_version', type: 'int' })
  sourceVersion: number;

  @Column({ name: 'name', type: 'varchar', length: 256 })
  name: string;

  @Column({ name: 'status', type: 'varchar', length: 64 })
  status: string;

  @Column({ name: 'synced_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  syncedAt: Date;
}
