import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { GetCategoryDto } from './dto/get-category.dto';
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';

import { CategoryService } from '../service/category.service';
import { GetCategoryTreeDto } from './dto/get-category-tree.dto';

@Controller()
export class CategoryController {
  constructor(private readonly service: CategoryService) {}

  @MessagePattern({ cmd: 'store.category.getByUuid' })
  getByUuid(@Payload() query: GetCategoryDto) {
    return this.service.getByUuid(query.uuid);
  }

  @MessagePattern({ cmd: 'store.category.create' })
  create(@Payload() input: CreateCategoryDto) {
    return this.service.create(input);
  }

  @MessagePattern({ cmd: 'store.category.update' })
  update(@Payload() input: UpdateCategoryDto) {
    return this.service.update(input);
  }

  @MessagePattern({ cmd: 'store.category.getTree' })
  getTree(@Payload() query: GetCategoryTreeDto) {
    return this.service.getTree(query.shopUuid);
  }
}
