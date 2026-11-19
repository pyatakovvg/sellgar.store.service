import { Expose } from 'class-transformer';
import { IsInt, Min } from 'class-validator';
import { InventoryMovementCommand } from './inventory-movement.command';
export class AdjustRecordInventoryCommand extends InventoryMovementCommand {
  @Expose()
  @IsInt()
  @Min(0)
  quantity: number;
}
