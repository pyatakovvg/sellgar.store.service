import { ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { EntityManager } from 'typeorm';
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
    const records = inputs ?? (existing.length ? [] : [{}]);
    const seen = new Set<string>();
    for (const input of records) {
      if (input.uuid && seen.has(input.uuid)) throw new ConflictException('Accounting record occurs twice');
      if (input.uuid) seen.add(input.uuid);
      let record: AccountingRecordModel;
      if (input.uuid) {
        record = await manager.findOneBy(AccountingRecordModel, { uuid: input.uuid, offerUuid });
        if (!record) throw new ConflictException('Accounting record does not belong to this variant association');
        await manager.update(
          AccountingRecordModel,
          { uuid: record.uuid, offerUuid },
          { article: input.article ?? record.article, version: () => 'version + 1' },
        );
      } else {
        const recordUuid = randomUUID();
        await manager.insert(AccountingRecordModel, {
          uuid: recordUuid,
          offerUuid,
          article: input.article ?? `SKU-${recordUuid}`,
        });
        await manager.insert(RecordInventoryModel, { recordUuid, quantity: 0, reserved: 0 });
        record = await manager.findOneByOrFail(AccountingRecordModel, { uuid: recordUuid });
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
