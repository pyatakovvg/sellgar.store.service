import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiV1Module } from './api/v1/api.module';
import { StoreDatabaseOptions } from './database/store-database.options';

@Module({
  imports: [
    ConfigModule.forRoot({ envFilePath: './.env', isGlobal: true }),
    TypeOrmModule.forRootAsync({ useFactory: () => StoreDatabaseOptions.create(process.env) }),
    ApiV1Module,
  ],
})
export class AppModule {}
