import { OutboxModuleOptions } from '@sellgar/outbox';

export const STORE_OUTBOX_OPTIONS: OutboxModuleOptions = {
  producer: 'store_srv',
  eventClientToken: 'STORE_EVENT_SERVICE',
  aggregateIdField: 'aggregateUuid',
  storage: {
    aggregateIdColumn: 'aggregate_uuid',
    hasProducerColumn: true,
    exhaustedStatus: 'dead',
  },
};
