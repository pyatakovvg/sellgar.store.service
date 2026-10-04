import { IsInt, IsISO8601, IsObject, IsString, IsUUID, Min } from 'class-validator';

export class IntegrationEventDto {
  @IsUUID()
  eventUuid: string;

  @IsString()
  eventType: string;

  @IsInt()
  @Min(1)
  schemaVersion: number;

  @IsString()
  producer: string;

  @IsString()
  aggregateType: string;

  @IsUUID()
  aggregateId: string;

  @IsInt()
  @Min(1)
  aggregateVersion: number;

  @IsISO8601()
  occurredAt: string;

  @IsObject()
  payload: Record<string, unknown>;
}
