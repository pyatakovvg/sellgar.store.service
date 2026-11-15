import { Expose } from 'class-transformer';
import { IsInt, IsUUID, Min } from 'class-validator';

import { CategoryFieldsCommand } from './category-fields.command';

export class UpdateCategoryCommand extends CategoryFieldsCommand {
  @Expose()
  @IsUUID()
  commandId: string;

  @Expose()
  @IsUUID()
  uuid: string;

  @Expose()
  @IsInt()
  @Min(1)
  expectedVersion: number;
}
