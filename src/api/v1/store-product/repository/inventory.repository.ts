import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { RecordInventoryEntity } from '../entity';
import { RecordInventoryModel } from '../model/record-inventory.model';
import { InventoryMovementModel } from '../model/inventory-movement.model';
import { InventoryMovementType } from '../enum/inventory-movement-type.enum';
import { InventoryMovementSourceType } from '../enum/inventory-movement-source-type.enum';
import { InventoryMovementCommand } from '../service/command/inventory-movement.command';
import { CommandRequestRepository } from './command-request.repository';
import { StoreEventRepository } from './store-event.repository';

@Injectable()
export class InventoryRepository {
  constructor(
    private readonly commands: CommandRequestRepository,
    private readonly events: StoreEventRepository,
  ) {}
  apply(command: InventoryMovementCommand, type: InventoryMovementType): Promise<RecordInventoryEntity> {
    return this.commands.execute(command, `store.inventory.${type}`, RecordInventoryEntity, async (manager) => {
      const inventory = await manager.findOne(RecordInventoryModel, {
        where: { recordUuid: command.recordUuid },
        lock: { mode: 'pessimistic_write' },
      });
      if (!inventory) throw new BadRequestException('Accounting record inventory is missing');
      if (inventory.version !== command.expectedVersion)
        throw new ConflictException('Accounting record inventory version conflict');
      const deltas = this.deltas(type, command.quantity, inventory.quantity);
      const quantity = inventory.quantity + deltas.quantity;
      const reserved = inventory.reserved + deltas.reserved;
      if (quantity < 0 || reserved < 0 || reserved > quantity)
        throw new BadRequestException('Inventory movement creates invalid stock state');
      await manager.update(
        RecordInventoryModel,
        { uuid: inventory.uuid, version: command.expectedVersion },
        { quantity, reserved, version: () => 'version + 1' },
      );
      await manager.insert(InventoryMovementModel, {
        recordUuid: command.recordUuid,
        type,
        quantityDelta: deltas.quantity,
        reservedDelta: deltas.reserved,
        sourceType:
          type === InventoryMovementType.ADJUSTMENT
            ? InventoryMovementSourceType.CORRECTION
            : InventoryMovementSourceType.MANUAL,
        sourceUuid: command.sourceUuid,
        reason: command.reason,
        createdBy: command.createdBy,
      });
      const result = plainToInstance(
        RecordInventoryEntity,
        await manager.findOneByOrFail(RecordInventoryModel, { uuid: inventory.uuid }),
        { excludeExtraneousValues: true },
      );
      await this.events.add(
        manager,
        'record_inventory',
        result.uuid,
        result.version,
        'store.inventory.updated',
        result,
      );
      return result;
    });
  }
  private deltas(type: InventoryMovementType, quantity: number, current: number) {
    switch (type) {
      case InventoryMovementType.RECEIPT:
        return { quantity, reserved: 0 };
      case InventoryMovementType.WRITE_OFF:
        return { quantity: -quantity, reserved: 0 };
      case InventoryMovementType.ADJUSTMENT:
        return { quantity: quantity - current, reserved: 0 };
      default:
        throw new BadRequestException('Unsupported inventory operation');
    }
  }
}
