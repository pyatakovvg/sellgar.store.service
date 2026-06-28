import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';

import { ArchiveStoreProductDto } from '../repository/dto/archive-store-product.dto';
import { AdjustOfferInventoryDto } from '../repository/dto/adjust-offer-inventory.dto';
import { CreateStoreProductDto } from '../repository/dto/create-store-product.dto';
import { ReceiptOfferInventoryDto } from '../repository/dto/receipt-offer-inventory.dto';
import { UpdateStoreProductDto } from '../repository/dto/update-store-product.dto';
import { WriteOffOfferInventoryDto } from '../repository/dto/write-off-offer-inventory.dto';
import { StoreProductService } from '../service/store-product.service';

@Controller()
export class StoreProductController {
  constructor(private readonly storeProductService: StoreProductService) {}

  @MessagePattern({ cmd: 'store.product.getAll' })
  findAll(@Payload('query') query: any) {
    return this.storeProductService.findAll(query);
  }

  @MessagePattern({ cmd: 'store.product.getByUuid' })
  findByUuid(@Payload('uuid') uuid: string) {
    return this.storeProductService.findByUuid(uuid);
  }

  @MessagePattern({ cmd: 'store.product.create' })
  create(@Payload() dto: CreateStoreProductDto) {
    return this.storeProductService.create(dto);
  }

  @MessagePattern({ cmd: 'store.product.update' })
  update(@Payload() dto: UpdateStoreProductDto) {
    return this.storeProductService.update(dto);
  }

  @MessagePattern({ cmd: 'store.product.archive' })
  archive(@Payload() dto: ArchiveStoreProductDto) {
    return this.storeProductService.archive(dto);
  }

  @MessagePattern({ cmd: 'store.inventory.receipt' })
  receiptInventory(@Payload() dto: ReceiptOfferInventoryDto) {
    return this.storeProductService.receiptInventory(dto);
  }

  @MessagePattern({ cmd: 'store.inventory.writeOff' })
  writeOffInventory(@Payload() dto: WriteOffOfferInventoryDto) {
    return this.storeProductService.writeOffInventory(dto);
  }

  @MessagePattern({ cmd: 'store.inventory.adjust' })
  adjustInventory(@Payload() dto: AdjustOfferInventoryDto) {
    return this.storeProductService.adjustInventory(dto);
  }
}
