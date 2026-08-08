import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { OutboxEventModel } from '../outbox-event.model';

type QueryRow = Record<string, unknown>;

export interface StoreOutboxMetrics {
  pending: number;
  processing: number;
  failed: number;
  dead: number;
}

@Injectable()
export class OutboxRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async claim(batchSize: number, maxAttempts: number, processingTimeoutMs: number): Promise<OutboxEventModel[]> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        `
          UPDATE outbox_event
          SET
            status = CASE WHEN attempts >= $2 THEN 'dead' ELSE 'failed' END,
            processing_started_at = NULL,
            next_attempt_at = NOW(),
            last_error = 'processing timeout'
          WHERE status = 'processing'
            AND processing_started_at < NOW() - ($1 * INTERVAL '1 millisecond')
        `,
        [processingTimeoutMs, maxAttempts],
      );

      const rows = this.rows(
        await manager.query(
          `
            WITH claimed AS (
              SELECT uuid
              FROM outbox_event
              WHERE status IN ('pending', 'failed')
                AND attempts < $1
                AND COALESCE(next_attempt_at, occurred_at) <= NOW()
              ORDER BY occurred_at ASC
              LIMIT $2
              FOR UPDATE SKIP LOCKED
            )
            UPDATE outbox_event AS outbox
            SET
              status = 'processing',
              processing_started_at = NOW(),
              last_error = NULL
            FROM claimed
            WHERE outbox.uuid = claimed.uuid
            RETURNING outbox.*
          `,
          [maxAttempts, batchSize],
        ),
      );

      return rows.map((row) => this.event(row));
    });
  }

  markPublished(eventUuid: string, attempts: number): Promise<unknown> {
    return this.dataSource.manager.query(
      `
        UPDATE outbox_event
        SET
          status = 'published',
          attempts = $2,
          published_at = NOW(),
          processing_started_at = NULL,
          next_attempt_at = NULL,
          last_error = NULL
        WHERE uuid = $1
      `,
      [eventUuid, attempts + 1],
    );
  }

  markFailed(
    eventUuid: string,
    attempts: number,
    retryAt: Date,
    error: unknown,
    terminal: boolean,
  ): Promise<unknown> {
    return this.dataSource.manager.query(
      `
        UPDATE outbox_event
        SET
          status = $5,
          attempts = $2,
          next_attempt_at = $3,
          processing_started_at = NULL,
          last_error = $4
        WHERE uuid = $1
      `,
      [eventUuid, attempts + 1, retryAt, error instanceof Error ? error.message : String(error), terminal ? 'dead' : 'failed'],
    );
  }

  async metrics(): Promise<StoreOutboxMetrics> {
    const [row] = this.rows(
      await this.dataSource.manager.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
          COUNT(*) FILTER (WHERE status = 'processing')::int AS processing,
          COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
          COUNT(*) FILTER (WHERE status = 'dead')::int AS dead
        FROM outbox_event
      `),
    );

    return {
      pending: Number(row?.pending ?? 0),
      processing: Number(row?.processing ?? 0),
      failed: Number(row?.failed ?? 0),
      dead: Number(row?.dead ?? 0),
    };
  }

  private event(row: QueryRow): OutboxEventModel {
    return Object.assign(new OutboxEventModel(), {
      uuid: String(row.uuid),
      producer: String(row.producer),
      aggregateType: String(row.aggregate_type),
      aggregateUuid: String(row.aggregate_uuid),
      aggregateVersion: Number(row.aggregate_version),
      eventType: String(row.event_type),
      schemaVersion: Number(row.schema_version),
      payload: row.payload as Record<string, unknown>,
      occurredAt: new Date(String(row.occurred_at)),
      attempts: Number(row.attempts),
      status: String(row.status),
    });
  }

  private rows(queryResult: unknown): QueryRow[] {
    if (Array.isArray(queryResult) && Array.isArray(queryResult[0])) {
      return queryResult[0] as QueryRow[];
    }
    return Array.isArray(queryResult) ? (queryResult as QueryRow[]) : [];
  }
}
