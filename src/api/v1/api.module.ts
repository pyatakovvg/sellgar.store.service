import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';

import { CurrencyModule } from './currency/currency.module';
import { StoreProductModule } from './store-product/store-product.module';
import { STORE_EVENT_SERVICE } from './store-product/service/outbox-relay.service';

@Module({
  imports: [
    ClientsModule.registerAsync({
      isGlobal: true,
      clients: [
        {
          name: STORE_EVENT_SERVICE,
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (config: ConfigService) => ({
            transport: Transport.RMQ,
            options: {
              urls: [
                {
                  port: config.get<number>('AMQP_PORT'),
                  hostname: config.get<string>('AMQP_HOSTNAME'),
                  username: config.get<string>('AMQP_USERNAME'),
                  password: config.get<string>('AMQP_PASSWORD'),
                },
              ],
              wildcards: true,
              persistent: true,
              queue: '',
              queueOptions: {
                durable: false,
                autoDelete: true,
              },
              exchange: config.get<string>('AMQP_EVENTS_EXCHANGE'),
              exchangeType: 'topic',
            },
          }),
        },
      ],
    }),
    CurrencyModule,
    StoreProductModule,
  ],
})
export class ApiV1Module {}
