import { IsUUID } from 'class-validator';

export class GetCategoryDto {
  @IsUUID()
  uuid: string;
}
