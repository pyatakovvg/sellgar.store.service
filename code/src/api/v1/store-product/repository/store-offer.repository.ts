import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { EntityManager } from 'typeorm';
import { StoreOfferModel } from '../model/store-offer.model';
import { VariantSnapshotModel } from '../model/variant-snapshot.model';
import { StoreOfferInputCommand } from '../service/command/store-offer-input.command';
import { AccountingRecordRepository } from './accounting-record.repository';

@Injectable()
export class StoreOfferRepository {
  constructor(private readonly records: AccountingRecordRepository) {}
  async synchronize(
    manager: EntityManager,
    storeProductUuid: string,
    productUuid: string,
    inputs: StoreOfferInputCommand[],
  ): Promise<void> {
    for (const input of inputs) {
      const variant = await manager.findOne(VariantSnapshotModel, {
        where: { variantUuid: input.variantUuid, productUuid },
        lock: { mode: 'pessimistic_read' },
      });
      if (!variant || variant.status !== 'active')
        throw new BadRequestException('Variant is missing, archived or belongs to another product');
      const offerUuid = input.uuid ?? randomUUID();
      if (input.uuid) {
        const offer = await manager.findOneBy(StoreOfferModel, {
          uuid: input.uuid,
          storeProductUuid,
          variantUuid: input.variantUuid,
        });
        if (!offer) throw new ConflictException('Variant association does not belong to this store product');
        await manager.update(
          StoreOfferModel,
          { uuid: offerUuid, storeProductUuid },
          { showing: input.showing, version: () => 'version + 1' },
        );
      } else
        await manager.insert(StoreOfferModel, {
          uuid: offerUuid,
          storeProductUuid,
          productUuid,
          variantUuid: input.variantUuid,
          showing: input.showing,
        });
      await this.records.synchronize(manager, offerUuid, input.records);
    }
  }
}
