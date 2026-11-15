import { Expose } from 'class-transformer';
import { IsUUID } from 'class-validator';

import { CategoryFieldsCommand } from './category-fields.command';

export class CreateCategoryCommand extends CategoryFieldsCommand {
  @Expose()
  @IsUUID()
  commandId: string;

  @Expose()
  @IsUUID()
  shopUuid: string;
}
