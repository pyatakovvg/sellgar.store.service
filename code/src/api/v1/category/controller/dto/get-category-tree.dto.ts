import { IsUUID } from 'class-validator';

export class GetCategoryTreeDto {
  @IsUUID()
  shopUuid: string;
}
