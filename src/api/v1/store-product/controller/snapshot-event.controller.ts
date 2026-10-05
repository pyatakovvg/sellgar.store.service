import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';

import { IntegrationEventDto } from '../service/dto/integration-event.dto';
import { SnapshotEventService } from '../service/snapshot-event.service';

@Controller()
export class SnapshotEventController {
  constructor(private readonly snapshotEventService: SnapshotEventService) {}

  @EventPattern('shop.created')
  applyShopCreatedEvent(@Payload() event: IntegrationEventDto) {
    return this.apply(event);
  }

  @EventPattern('shop.updated')
  applyShopUpdatedEvent(@Payload() event: IntegrationEventDto) {
    return this.apply(event);
  }

  @EventPattern('product.created')
  applyProductCreatedEvent(@Payload() event: IntegrationEventDto) {
    return this.apply(event);
  }

  @EventPattern('product.updated')
  applyProductUpdatedEvent(@Payload() event: IntegrationEventDto) {
    return this.apply(event);
  }

  private apply(event: IntegrationEventDto) {
    return this.snapshotEventService.apply(event);
  }
}
