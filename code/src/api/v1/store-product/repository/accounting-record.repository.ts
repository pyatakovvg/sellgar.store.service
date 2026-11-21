import { ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { EntityManager } from 'typeorm';
import { PriceHistoryModel } from '../model/price-history.model';
import { AccountingRecordModel } from '../model/accounting-record.model';
import { RecordClarificationModel } from '../model/record-clarification.model';
import { RecordInventoryModel } from '../model/record-inventory.model';
import { AccountingRecordInputCommand } from '../service/command/accounting-record-input.command';

@Injectable()
export class AccountingRecordRepository {
  async synchronize(
    manager: EntityManager,
    offerUuid: string,
    inputs: AccountingRecordInputCommand[] | undefined,
  ): Promise<void> {
    const existing = await manager.findBy(AccountingRecordModel, { offerUuid });
    const records = inputs ?? [];
    if (!existing.length && !records.length)
      throw new ConflictException('A new offer requires an accounting record with a price');
    const existingByUuid = new Map(existing.map((record) => [record.uuid, record]));
    const seen = new Set<string>();
    let nextOrder =
      Math.max(-1, ...existing.map((record) => record.order), ...records.map((record) => record.order ?? -1)) + 1;
    const prepared = records.map((input) => {
      if (input.uuid && seen.has(input.uuid)) throw new ConflictException('Accounting record occurs twice');
      if (input.uuid) seen.add(input.uuid);
      const current = input.uuid ? existingByUuid.get(input.uuid) : undefined;
      if (input.uuid && !current)
        throw new ConflictException('Accounting record does not belong to this variant association');

      return { input, order: input.order ?? current?.order ?? nextOrder++ };
    });
    const orders = [
      ...existing.filter((record) => !seen.has(record.uuid)).map((record) => record.order),
      ...prepared.map((record) => record.order),
    ];
    if (new Set(orders).size !== orders.length) throw new ConflictException('Accounting record order occurs twice');

    for (const { input, order } of prepared) {
      let record: AccountingRecordModel;
      if (input.uuid) {
        record = existingByUuid.get(input.uuid)!;
        await manager.update(
          AccountingRecordModel,
          { uuid: record.uuid, offerUuid },
          { article: input.article ?? record.article, order, version: () => 'version + 1' },
        );
      } else {
        if (!input.currentPrice) throw new ConflictException('A new accounting record requires a price');
        const recordUuid = randomUUID();
        await manager.insert(AccountingRecordModel, {
          uuid: recordUuid,
          offerUuid,
          article: input.article ?? `SKU-${recordUuid}`,
          order,
        });
        await manager.insert(RecordInventoryModel, { recordUuid, quantity: 0, reserved: 0 });
        record = await manager.findOneByOrFail(AccountingRecordModel, { uuid: recordUuid });
      }
      if (input.currentPrice) {
        const [integer, fraction = ''] = input.currentPrice.value.split('.');
        const value = `${integer.replace(/^0+(?=\d)/, '')}.${fraction.padEnd(2, '0')}`;
        const current = await manager.findOne(PriceHistoryModel, {
          where: { recordUuid: record.uuid },
          order: { createdAt: 'DESC', uuid: 'DESC' },
        });
        if (!current || current.value !== value || current.currencyCode !== input.currentPrice.currencyCode) {
          if (current) await manager.update(PriceHistoryModel, { uuid: current.uuid }, { endsAt: new Date() });
          await manager.insert(PriceHistoryModel, {
            recordUuid: record.uuid,
            value,
            currencyCode: input.currentPrice.currencyCode,
          });
        }
      }
      if (input.clarifications !== undefined) {
        await manager.delete(RecordClarificationModel, { recordUuid: record.uuid });
        if (input.clarifications.length)
          await manager.insert(
            RecordClarificationModel,
            input.clarifications.map((item, position) => ({ recordUuid: record.uuid, position, value: item.value })),
          );
      }
    }
  }
}
