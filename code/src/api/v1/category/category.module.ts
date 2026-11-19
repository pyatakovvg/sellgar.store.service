import { CommandRequestRepository } from '../store-product/repository/command-request.repository';
import { StoreEventRepository } from '../store-product/repository/store-event.repository';
import { CommandFactory } from '../store-product/service/command/command.factory';
import { CategoryCommandRepository } from './repository/category-command.repository';
import { Module } from '@nestjs/common';

import { CategoryController } from './controller/category.controller';
import { CategoryRepository } from './repository/category.repository';
import { CategoryService } from './service/category.service';

@Module({
  controllers: [CategoryController],
  providers: [
    CategoryRepository,
    CategoryService,
    CategoryCommandRepository,
    CommandRequestRepository,
    StoreEventRepository,
    CommandFactory,
  ],
})
export class CategoryModule {}
