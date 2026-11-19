import { IsUUID } from 'class-validator';

export class GetProductByRecordDto {
  @IsUUID()
  recordUuid: string;
}
