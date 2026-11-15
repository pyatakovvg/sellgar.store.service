import { CategoryCommandRepository } from '../repository/category-command.repository';
import { CommandFactory } from '../../store-product/service/command/command.factory';
import { CreateCategoryCommand } from './command/create-category.command';
import { UpdateCategoryCommand } from './command/update-category.command';
import { Injectable } from '@nestjs/common';
import { validateOrReject } from 'class-validator';

import { CategoryRepository } from '../repository/category.repository';
import { CategoryTreeEntity } from '../entity/category-tree.entity';
import { CategoryTreeMapper } from './mapper/category-tree.mapper';

@Injectable()
export class CategoryService {
  constructor(
    private readonly repository: CategoryRepository,
    private readonly writes: CategoryCommandRepository,
    private readonly commands: CommandFactory,
  ) {}

  async getByUuid(uuid: string) {
    const category = await this.repository.getByUuid(uuid);
    await validateOrReject(category);
    return category;
  }

  async create(input: CreateCategoryCommand) {
    return this.writes.create(await this.commands.create(CreateCategoryCommand, input));
  }

  async update(input: UpdateCategoryCommand) {
    return this.writes.update(await this.commands.create(UpdateCategoryCommand, input));
  }

  async getTree(shopUuid: string): Promise<CategoryTreeEntity> {
    const tree = CategoryTreeMapper.map(shopUuid, await this.repository.getAll(shopUuid));
    await validateOrReject(tree);
    return tree;
  }
}
