import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import { StoreProductResultEntity, StorefrontOfferResultEntity } from '../entity';
import { StoreProductRepository } from '../repository/store-product.repository';
import { StoreProductQueryRepository } from '../repository/store-product-query.repository';
import { InventoryRepository } from '../repository/inventory.repository';
import { InventoryMovementType } from '../enum/inventory-movement-type.enum';
import { CommandFactory } from './command/command.factory';
import { CreateStoreProductCommand } from './command/create-store-product.command';
import { UpdateStoreProductCommand } from './command/update-store-product.command';
import { ArchiveStoreProductCommand } from './command/archive-store-product.command';
import { GetAllStoreProductsCommand } from './command/get-all-store-products.command';
import { InventoryMovementCommand } from './command/inventory-movement.command';
import { AdjustRecordInventoryCommand } from './command/adjust-record-inventory.command';

@Injectable()
export class StoreProductService {
  constructor(
    private readonly repository: StoreProductRepository,
    private readonly queries: StoreProductQueryRepository,
    private readonly inventory: InventoryRepository,
    private readonly commands: CommandFactory,
  ) {}
  async getAll(input: GetAllStoreProductsCommand = {}) {
    const query = await this.commands.create(GetAllStoreProductsCommand, input);
    const result = plainToInstance(StoreProductResultEntity, await this.queries.getAll(query), {
      excludeExtraneousValues: true,
    });
    await validateOrReject(result);
    return result;
  }
  async getByUuid(uuid: string, input: GetAllStoreProductsCommand = {}) {
    const query = await this.commands.create(GetAllStoreProductsCommand, input);
    return this.queries.getByUuid(uuid, query);
  }
  async getOffers(input: GetAllStoreProductsCommand = {}) {
    const query = await this.commands.create(GetAllStoreProductsCommand, input);
    const result = plainToInstance(StorefrontOfferResultEntity, await this.queries.getOffers(query), {
      excludeExtraneousValues: true,
    });
    await validateOrReject(result);
    return result;
  }
  async getOffer(uuid: string, input: GetAllStoreProductsCommand = {}) {
    const query = await this.commands.create(GetAllStoreProductsCommand, input);
    return this.queries.getOffer(uuid, query);
  }
  async create(input: CreateStoreProductCommand) {
    return this.repository.create(await this.commands.create(CreateStoreProductCommand, input));
  }
  async update(input: UpdateStoreProductCommand) {
    return this.repository.update(await this.commands.create(UpdateStoreProductCommand, input));
  }
  async archive(input: ArchiveStoreProductCommand) {
    return this.repository.archive(await this.commands.create(ArchiveStoreProductCommand, input));
  }
  async receiptInventory(input: InventoryMovementCommand) {
    return this.inventory.apply(
      await this.commands.create(InventoryMovementCommand, input),
      InventoryMovementType.RECEIPT,
    );
  }
  async writeOffInventory(input: InventoryMovementCommand) {
    return this.inventory.apply(
      await this.commands.create(InventoryMovementCommand, input),
      InventoryMovementType.WRITE_OFF,
    );
  }
  async adjustInventory(input: AdjustRecordInventoryCommand) {
    return this.inventory.apply(
      await this.commands.create(AdjustRecordInventoryCommand, input),
      InventoryMovementType.ADJUSTMENT,
    );
  }
}
