import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { plainToInstance } from 'class-transformer';
import { firstValueFrom, timeout } from 'rxjs';
import { ProductSnapshotPayloadDto } from './dto/product-snapshot-payload.dto';
import { SnapshotEventService } from './snapshot-event.service';

@Injectable()
export class CatalogSyncService {
  constructor(
    @Inject('PRODUCT_V2_COMMAND_SERVICE') private readonly productClient: ClientProxy,
    private readonly snapshots: SnapshotEventService,
  ) {}
  async synchronize(productUuid: string) {
    const result = await firstValueFrom(
      this.productClient.send({ cmd: 'catalog.v2.product.getByUuid' }, { uuid: productUuid }).pipe(timeout(10000)),
    );
    const payload = plainToInstance(ProductSnapshotPayloadDto, result);
    if (payload.uuid !== productUuid) throw new Error('Catalog response identifies another product');
    await this.snapshots.synchronizeProduct(payload);
    return { productUuid, version: payload.version };
  }
}
