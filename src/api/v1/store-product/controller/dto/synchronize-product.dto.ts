import { IsUUID } from 'class-validator';
export class SynchronizeProductDto {
  @IsUUID()
  productUuid: string;
}
