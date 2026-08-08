import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

import { OutboxEventModel } from '../outbox-event.model';
import { OutboxRepository } from '../repository/outbox.repository';

export const STORE_EVENT_SERVICE = 'STORE_EVENT_SERVICE';

@Injectable()
export class OutboxRelayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelayService.name);
  private publishing = false;
  private publishTimer?: ReturnType<typeof setInterval>;
  private metricsTimer?: ReturnType<typeof setInterval>;

  constructor(
    @Inject(STORE_EVENT_SERVICE) private readonly eventClient: ClientProxy,
    private readonly config: ConfigService,
    private readonly repository: OutboxRepository,
  ) {}

  onModuleInit(): void {
    this.publishTimer = setInterval(
      () => void this.publishPending(),
      this.number('OUTBOX_PUBLISH_INTERVAL_MS', 1000),
    );
    this.metricsTimer = setInterval(
      () => void this.logMetrics(),
      this.number('OUTBOX_METRICS_INTERVAL_MS', 30000),
    );
    void this.publishPending();
  }

  onModuleDestroy(): void {
    if (this.publishTimer) {
      clearInterval(this.publishTimer);
    }
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
    }
  }

  private async publishPending(): Promise<void> {
    if (this.publishing) {
      return;
    }

    this.publishing = true;
    try {
      const maxAttempts = this.number('OUTBOX_MAX_ATTEMPTS', 10);
      const events = await this.repository.claim(
        this.number('OUTBOX_BATCH_SIZE', 50),
        maxAttempts,
        this.number('OUTBOX_PROCESSING_TIMEOUT_MS', 60000),
      );

      for (const event of events) {
        await this.publish(event, maxAttempts);
      }
    } catch (error) {
      this.logger.error('Store outbox relay iteration failed', error instanceof Error ? error.stack : undefined);
    } finally {
      this.publishing = false;
    }
  }

  private async publish(event: OutboxEventModel, maxAttempts: number): Promise<void> {
    const envelope = {
      eventUuid: event.uuid,
      eventType: event.eventType,
      schemaVersion: event.schemaVersion,
      producer: event.producer,
      aggregateType: event.aggregateType,
      aggregateUuid: event.aggregateUuid,
      aggregateVersion: event.aggregateVersion,
      occurredAt: event.occurredAt.toISOString(),
      payload: event.payload,
    };

    try {
      await this.emitWithTimeout(event.eventType, envelope);
      await this.repository.markPublished(event.uuid, event.attempts);
    } catch (error) {
      const attempts = event.attempts + 1;
      await this.repository.markFailed(
        event.uuid,
        event.attempts,
        this.retryAt(attempts),
        error,
        attempts >= maxAttempts,
      );
    }
  }

  private async emitWithTimeout(eventType: string, envelope: Record<string, unknown>): Promise<void> {
    const timeoutMs = this.number('OUTBOX_PUBLISH_TIMEOUT_MS', 5000);
    const publish = firstValueFrom(this.eventClient.emit(eventType, envelope));
    let timeout: ReturnType<typeof setTimeout> | undefined;
    publish.catch(() => undefined);

    try {
      await Promise.race([
        publish,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error(`outbox publish timeout after ${timeoutMs}ms`)), timeoutMs);
        }),
      ]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  private retryAt(attempts: number): Date {
    const baseMs = this.number('OUTBOX_RETRY_BASE_DELAY_MS', 1000);
    const maxMs = this.number('OUTBOX_RETRY_MAX_DELAY_MS', 60000);
    return new Date(Date.now() + Math.min(baseMs * 2 ** Math.max(attempts - 1, 0), maxMs));
  }

  private async logMetrics(): Promise<void> {
    try {
      const metrics = await this.repository.metrics();
      if (metrics.pending || metrics.processing || metrics.failed || metrics.dead) {
        this.logger.warn(
          `outbox metrics: pending=${metrics.pending}, processing=${metrics.processing}, failed=${metrics.failed}, dead=${metrics.dead}`,
        );
      }
    } catch (error) {
      this.logger.error('Failed to read store outbox metrics', error instanceof Error ? error.stack : undefined);
    }
  }

  private number(name: string, fallback: number): number {
    const value = Number(this.config.get<string>(name));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }
}
