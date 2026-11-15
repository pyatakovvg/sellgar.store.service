import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { randomUUID } from 'node:crypto';
import { EntityManager, QueryFailedError } from 'typeorm';

import { CommandRequestRepository } from '../../store-product/repository/command-request.repository';
import { StoreEventRepository } from '../../store-product/repository/store-event.repository';
import { ShopSnapshotModel } from '../../store-product/model/shop-snapshot.model';
import { CategoryEntity } from '../entity/category.entity';
import { CategoryModel } from '../model/category.model';
import { CreateCategoryCommand } from '../service/command/create-category.command';
import { UpdateCategoryCommand } from '../service/command/update-category.command';

@Injectable()
export class CategoryCommandRepository {
  constructor(
    private readonly commands: CommandRequestRepository,
    private readonly events: StoreEventRepository,
  ) {}

  create(command: CreateCategoryCommand): Promise<CategoryEntity> {
    return this.commands.execute(command, 'store.category.create', CategoryEntity, async (manager) => {
      await this.lockShop(manager, command.shopUuid);
      await this.validateParent(manager, command.shopUuid, command.parentUuid);
      const uuid = randomUUID();
      const sortOrder = await this.nextOrder(manager, command.shopUuid, command.parentUuid);
      await this.write(() =>
        manager.insert(CategoryModel, {
          uuid,
          shopUuid: command.shopUuid,
          parentUuid: command.parentUuid,
          name: command.name,
          description: command.description,
          sortOrder,
        }),
      );
      return this.complete(manager, uuid, 'store.category.created');
    });
  }

  update(command: UpdateCategoryCommand): Promise<CategoryEntity> {
    return this.commands.execute(command, 'store.category.update', CategoryEntity, async (manager) => {
      const reference = await manager.findOneBy(CategoryModel, { uuid: command.uuid });
      if (!reference) throw new NotFoundException('Категория не найдена.');
      await this.lockShop(manager, reference.shopUuid);
      const current = await manager.findOne(CategoryModel, {
        where: { uuid: command.uuid },
        lock: { mode: 'pessimistic_write' },
      });
      if (!current || current.version !== command.expectedVersion) {
        throw new ConflictException('Категория уже изменена. Откройте её заново.');
      }
      await this.validateParent(manager, current.shopUuid, command.parentUuid, current.uuid);
      const sortOrder =
        current.parentUuid === command.parentUuid
          ? current.sortOrder
          : await this.nextOrder(manager, current.shopUuid, command.parentUuid);
      await this.write(() =>
        manager.update(
          CategoryModel,
          { uuid: current.uuid, version: command.expectedVersion },
          {
            parentUuid: command.parentUuid,
            name: command.name,
            description: command.description,
            sortOrder,
            version: () => 'version + 1',
          },
        ),
      );
      return this.complete(manager, current.uuid, 'store.category.updated');
    });
  }

  private async lockShop(manager: EntityManager, shopUuid: string): Promise<void> {
    await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [shopUuid]);
    if (!(await manager.getRepository(ShopSnapshotModel).existsBy({ shopUuid })))
      throw new NotFoundException('Магазин не найден.');
  }

  private async validateParent(
    manager: EntityManager,
    shopUuid: string,
    parentUuid: string | null,
    uuid?: string,
  ): Promise<void> {
    if (parentUuid === null) return;
    if (!(await manager.getRepository(CategoryModel).existsBy({ uuid: parentUuid, shopUuid }))) {
      throw new BadRequestException('Родительская категория должна принадлежать этому магазину.');
    }
    const assigned = await manager.query('SELECT 1 FROM store_product_category WHERE category_uuid = $1 LIMIT 1', [
      parentUuid,
    ]);
    if (assigned.length > 0) {
      throw new ConflictException(
        'Категория используется товарами. Сначала перенесите товары в другие конечные категории.',
      );
    }
    if (uuid) {
      const cycle = await manager.query(
        `WITH RECURSIVE ancestors AS (
        SELECT uuid, parent_uuid FROM category WHERE uuid = $1 AND shop_uuid = $2
        UNION
        SELECT c.uuid, c.parent_uuid FROM category c JOIN ancestors a ON c.uuid = a.parent_uuid WHERE c.shop_uuid = $2
      ) SELECT uuid FROM ancestors WHERE uuid = $3`,
        [parentUuid, shopUuid, uuid],
      );
      if (cycle.length > 0) throw new BadRequestException('Нельзя переместить категорию в себя или своего потомка.');
    }
  }

  private async nextOrder(manager: EntityManager, shopUuid: string, parentUuid: string | null): Promise<number> {
    const result = await manager.query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS position FROM category WHERE shop_uuid = $1 AND parent_uuid IS NOT DISTINCT FROM $2::uuid',
      [shopUuid, parentUuid],
    );
    return result[0].position;
  }

  private async complete(manager: EntityManager, uuid: string, eventType: string): Promise<CategoryEntity> {
    const category = await manager.findOneByOrFail(CategoryModel, { uuid });
    const entity = plainToInstance(
      CategoryEntity,
      { ...category, createdAt: category.createdAt.toISOString(), updatedAt: category.updatedAt.toISOString() },
      { excludeExtraneousValues: true },
    );
    await this.events.add(manager, 'category', uuid, entity.version, eventType, entity);
    return entity;
  }

  private async write(operation: () => Promise<unknown>): Promise<void> {
    try {
      await operation();
    } catch (error) {
      if (error instanceof QueryFailedError) {
        const detail: { code?: string; constraint?: string } = error.driverError;
        if (
          detail.code === '23505' &&
          ['category_root_name_uq', 'category_sibling_name_uq'].includes(detail.constraint ?? '')
        ) {
          throw new ConflictException('Категория с таким названием уже существует у выбранного родителя.');
        }
        if (detail.code === '23503' || detail.code === '23514')
          throw new BadRequestException('Недопустимые данные категории.');
      }
      throw error;
    }
  }
}
