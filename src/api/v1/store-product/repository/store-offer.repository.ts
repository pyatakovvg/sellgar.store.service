import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { EntityManager } from 'typeorm';
import { StoreOfferModel } from '../model/store-offer.model';
import { PriceHistoryModel } from '../model/price-history.model';
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
      const [integer, fraction = ''] = input.currentPrice.value.split('.');
      const value = `${integer.replace(/^0+(?=\d)/, '')}.${fraction.padEnd(2, '0')}`;
      const current = await manager.findOne(PriceHistoryModel, {
        where: { offerUuid },
        order: { createdAt: 'DESC', uuid: 'DESC' },
      });
      if (!current || current.value !== value || current.currencyCode !== input.currentPrice.currencyCode) {
        if (current) await manager.update(PriceHistoryModel, { uuid: current.uuid }, { endsAt: new Date() });
        await manager.insert(PriceHistoryModel, { offerUuid, value, currencyCode: input.currentPrice.currencyCode });
      }
      await this.records.synchronize(manager, offerUuid, input.records);
    }
  }
}
