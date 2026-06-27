import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger();
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.RMQ,
    options: {
      urls: [
        {
          port: Number(new ConfigService().get('AMQP_PORT')),
          hostname: new ConfigService().get('AMQP_HOSTNAME'),
          username: new ConfigService().get('AMQP_USERNAME'),
          password: new ConfigService().get('AMQP_PASSWORD'),
        },
      ],
      persistent: true,
      queue: new ConfigService().get('AMQP_STORE_SRV_COMMAND_QUEUE'),
      queueOptions: {
        durable: true,
      },
    },
  });

  await app.listen();
  logger.log('Store service has been started.');
}

bootstrap();
