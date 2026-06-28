import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';

import { DataSource, EntityManager } from 'typeorm';

import { InboxEventModel } from '../inbox-event.model';
import { ProductSnapshotModel } from '../product-snapshot.model';
import { ShopSnapshotModel } from '../shop-snapshot.model';
import { SyncIssueModel } from '../sync-issue.model';
import { VariantSnapshotModel } from '../variant-snapshot.model';

import { IntegrationEventDto } from './dto/integration-event.dto';

type EventApplyStatus = 'processed' | 'ignored' | 'parked';

@Injectable()
export class SnapshotEventService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async apply(event: IntegrationEventDto) {
    await this.dataSource.transaction(async (manager) => {
      const existing = await manager.findOne(InboxEventModel, { where: { eventUuid: event.eventUuid } });

      if (existing?.status === 'processed') {
        return;
      }

      let status: EventApplyStatus = 'ignored';

      if (event.aggregateType === 'shop') {
        status = await this.applyShopEvent(manager, event);
      } else if (event.aggregateType === 'product') {
        status = await this.applyProductEvent(manager, event);
      } else if (event.aggregateType === 'variant') {
        status = await this.applyVariantEvent(manager, event);
      }

      await this.recordInboxEvent(manager, event, status, existing?.attempts ?? 0);
    });
  }

  private async applyShopEvent(manager: EntityManager, event: IntegrationEventDto): Promise<EventApplyStatus> {
    const current = await manager.findOne(ShopSnapshotModel, { where: { shopUuid: event.aggregateUuid } });

    const preflightStatus = await this.checkVersion(manager, event, current?.sourceVersion);

    if (preflightStatus !== 'processed') {
      return preflightStatus;
    }

    await manager.upsert(
      ShopSnapshotModel,
      [
        {
          shopUuid: event.aggregateUuid,
          sourceVersion: event.aggregateVersion,
          name: this.stringPayload(event, 'name'),
          status: this.statusPayload(event),
          syncedAt: new Date(),
        },
      ],
      ['shopUuid'],
    );

    return 'processed';
  }

  private async applyProductEvent(manager: EntityManager, event: IntegrationEventDto): Promise<EventApplyStatus> {
    const current = await manager.findOne(ProductSnapshotModel, { where: { productUuid: event.aggregateUuid } });

    const preflightStatus = await this.checkVersion(manager, event, current?.sourceVersion);

    if (preflightStatus !== 'processed') {
      return preflightStatus;
    }

    await manager.upsert(
      ProductSnapshotModel,
      [
        {
          productUuid: event.aggregateUuid,
          sourceVersion: event.aggregateVersion,
          name: this.stringPayload(event, 'name'),
          status: this.statusPayload(event),
          syncedAt: new Date(),
        },
      ],
      ['productUuid'],
    );

    return 'processed';
  }

  private async applyVariantEvent(manager: EntityManager, event: IntegrationEventDto): Promise<EventApplyStatus> {
    const productUuid = this.stringPayload(event, 'productUuid');
    const product = await manager.findOne(ProductSnapshotModel, { where: { productUuid } });

    if (!product) {
      await this.insertSyncIssue(manager, event, null, 'missing_parent');
      return 'parked';
    }

    const current = await manager.findOne(VariantSnapshotModel, { where: { variantUuid: event.aggregateUuid } });

    const preflightStatus = await this.checkVersion(manager, event, current?.sourceVersion);

    if (preflightStatus !== 'processed') {
      return preflightStatus;
    }

    await manager.upsert(
      VariantSnapshotModel,
      [
        {
          variantUuid: event.aggregateUuid,
          productUuid,
          sourceVersion: event.aggregateVersion,
          name: this.stringPayload(event, 'name'),
          status: this.statusPayload(event),
          syncedAt: new Date(),
        },
      ],
      ['variantUuid'],
    );

    return 'processed';
  }

  private async checkVersion(manager: EntityManager, event: IntegrationEventDto, currentVersion?: number): Promise<EventApplyStatus> {
    if (currentVersion && event.aggregateVersion <= currentVersion) {
      return 'ignored';
    }

    const expectedVersion = currentVersion ? currentVersion + 1 : 1;

    if (event.aggregateVersion > expectedVersion) {
      await this.insertSyncIssue(manager, event, expectedVersion, 'version_gap');
      return 'parked';
    }

    return 'processed';
  }

  private async insertSyncIssue(manager: EntityManager, event: IntegrationEventDto, expectedVersion: number | null, reason: string) {
    const existing = await manager.findOne(SyncIssueModel, { where: { eventUuid: event.eventUuid, status: 'open' } });

    if (existing) {
      return;
    }

    await manager.insert(SyncIssueModel, {
      producer: event.producer,
      aggregateType: event.aggregateType,
      aggregateUuid: event.aggregateUuid,
      expectedVersion,
      receivedVersion: event.aggregateVersion,
      eventUuid: event.eventUuid,
      reason,
      payload: event.payload,
      status: 'open',
    });
  }

  private recordInboxEvent(manager: EntityManager, event: IntegrationEventDto, status: EventApplyStatus, attempts: number) {
    return manager.upsert(
      InboxEventModel,
      [
        {
          eventUuid: event.eventUuid,
          producer: event.producer,
          schemaVersion: event.schemaVersion,
          eventType: event.eventType,
          aggregateType: event.aggregateType,
          aggregateUuid: event.aggregateUuid,
          aggregateVersion: event.aggregateVersion,
          processedAt: status === 'processed' || status === 'ignored' ? new Date() : null,
          status,
          attempts: attempts + 1,
        },
      ],
      ['eventUuid'],
    );
  }

  private stringPayload(event: IntegrationEventDto, field: string) {
    return String(event.payload[field] ?? '');
  }

  private optionalStringPayload(event: IntegrationEventDto, field: string) {
    const value = event.payload[field];
    return typeof value === 'string' ? value : null;
  }

  private statusPayload(event: IntegrationEventDto) {
    const status = this.optionalStringPayload(event, 'status');

    if (status) {
      return status;
    }

    if (event.eventType.endsWith('.disabled')) {
      return 'disabled';
    }

    if (event.eventType.endsWith('.archived') || event.eventType.endsWith('.deleted')) {
      return 'archived';
    }

    return 'active';
  }
}
