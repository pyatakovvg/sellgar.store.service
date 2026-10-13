import { Controller } from '@nestjs/common';
import { Ctx, EventPattern, MessagePattern, Payload, RmqContext } from '@nestjs/microservices';

import { IntegrationEventDto } from '../service/dto/integration-event.dto';
import { CatalogSyncService } from '../service/catalog-sync.service';
import { SynchronizeProductDto } from './dto/synchronize-product.dto';
import { SnapshotEventService } from '../service/snapshot-event.service';

@Controller()
export class SnapshotEventController {
  constructor(
    private readonly snapshotEventService: SnapshotEventService,
    private readonly catalogSync: CatalogSyncService,
  ) {}

  @EventPattern('shop.created')
  applyShopCreatedEvent(@Payload() event: IntegrationEventDto, @Ctx() context: RmqContext) {
    return this.apply(event, context);
  }

  @EventPattern('shop.updated')
  applyShopUpdatedEvent(@Payload() event: IntegrationEventDto, @Ctx() context: RmqContext) {
    return this.apply(event, context);
  }

  @EventPattern('product.created')
  applyProductCreatedEvent(@Payload() event: IntegrationEventDto, @Ctx() context: RmqContext) {
    return this.apply(event, context);
  }

  @EventPattern('product.updated')
  applyProductUpdatedEvent(@Payload() event: IntegrationEventDto, @Ctx() context: RmqContext) {
    return this.apply(event, context);
  }

  @MessagePattern({ cmd: 'store.catalog.synchronize' })
  synchronize(@Payload() dto: SynchronizeProductDto) {
    return this.catalogSync.synchronize(dto.productUuid);
  }

  private async apply(event: IntegrationEventDto, context: RmqContext) {
    const channel = context.getChannelRef();
    const message = context.getMessage();
    try {
      await this.snapshotEventService.apply(event);
      channel.ack(message);
    } catch (error) {
      channel.nack(message, false, true);
      throw error;
    }
  }
}
