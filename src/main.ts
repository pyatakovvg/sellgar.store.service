import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { RpcHttpExceptionFilter } from './common/rpc-http-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new RpcHttpExceptionFilter());
  const config = app.get(ConfigService);
  const urls = [
    {
      port: Number(config.get('AMQP_PORT')),
      hostname: config.getOrThrow<string>('AMQP_HOSTNAME'),
      username: config.getOrThrow<string>('AMQP_USERNAME'),
      password: config.getOrThrow<string>('AMQP_PASSWORD'),
    },
  ];
  app.connectMicroservice<MicroserviceOptions>(
    {
      transport: Transport.RMQ,
      options: {
        urls,
        persistent: true,
        queue: config.getOrThrow('AMQP_STORE_SRV_COMMAND_QUEUE'),
        queueOptions: { durable: true },
      },
    },
    { inheritAppConfig: true },
  );
  app.connectMicroservice<MicroserviceOptions>(
    {
      transport: Transport.RMQ,
      options: {
        urls,
        persistent: true,
        wildcards: true,
        noAck: false,
        queue: config.getOrThrow('AMQP_STORE_SRV_EVENT_QUEUE'),
        queueOptions: { durable: true },
        exchange: config.getOrThrow('AMQP_EVENTS_EXCHANGE'),
        exchangeType: 'topic',
      },
    },
    { inheritAppConfig: true },
  );
  await app.init();
  await app.startAllMicroservices();
  Logger.log('Store service started', 'Bootstrap');
}
void bootstrap().catch((error) => {
  Logger.error(error instanceof Error ? error.message : 'Store bootstrap failed', 'Bootstrap');
  process.exitCode = 1;
});
