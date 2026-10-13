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
          name: 'PRODUCT_V2_COMMAND_SERVICE',
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (config: ConfigService) => ({
            transport: Transport.RMQ,
            options: {
              urls: [
                {
                  port: Number(config.get('AMQP_PORT')),
                  hostname: config.get('AMQP_HOSTNAME'),
                  username: config.get('AMQP_USERNAME'),
                  password: config.get('AMQP_PASSWORD'),
                },
              ],
              queue: config.getOrThrow('PRODUCT_V2_COMMAND_QUEUE'),
              queueOptions: { durable: true },
              persistent: true,
            },
          }),
        },
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
