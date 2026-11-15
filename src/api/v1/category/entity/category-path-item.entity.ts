import { Expose } from 'class-transformer';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class CategoryPathItemEntity {
  @Expose()
  @IsUUID()
  uuid: string;

  @Expose()
  @IsString()
  @IsNotEmpty()
  name: string;
}
