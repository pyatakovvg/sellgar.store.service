import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger();
  const config = new ConfigService();

  const commandApp = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
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
      persistent: true,
      queue: config.get('AMQP_STORE_SRV_COMMAND_QUEUE'),
      queueOptions: {
        durable: true,
      },
    },
  });

  const eventApp = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
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
      persistent: true,
      wildcards: true,
      queue: config.get('AMQP_STORE_SRV_EVENT_QUEUE'),
      queueOptions: {
        durable: true,
      },
      exchange: config.get('AMQP_EVENTS_EXCHANGE'),
      exchangeType: 'topic',
    },
  });

  commandApp.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  eventApp.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  await Promise.all([commandApp.listen(), eventApp.listen()]);
  logger.log('Store service has been started.');
}

bootstrap();
