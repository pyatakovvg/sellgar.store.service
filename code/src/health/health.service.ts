import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class HealthService {
  private readonly consumers = { commands: false, events: false };

  constructor(private readonly database: DataSource) {}

  setConsumerConnected(consumer: 'commands' | 'events', connected: boolean): void {
    this.consumers[consumer] = connected;
  }

  async check(): Promise<{ service: string; status: 'ok' }> {
    if (!this.consumers.commands || !this.consumers.events) {
      throw new ServiceUnavailableException('Store RabbitMQ consumers are unavailable');
    }

    try {
      await this.database.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException('Store database is unavailable');
    }

    return { service: 'sellgar.store.service', status: 'ok' };
  }
}
