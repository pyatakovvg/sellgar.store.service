import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ApiV1Module } from '@/api/v1/api.module';

@Module({
  imports: [ConfigModule.forRoot({ envFilePath: './.env', isGlobal: true }), ApiV1Module],
})
export class AppModule {}
