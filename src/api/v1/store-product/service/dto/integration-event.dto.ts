export interface IntegrationEventDto {
  eventUuid: string;
  eventType: string;
  schemaVersion: number;
  producer: string;
  aggregateType: string;
  aggregateUuid: string;
  aggregateVersion: number;
  occurredAt: string;
  payload: Record<string, unknown>;
}
