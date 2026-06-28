import { Injectable } from '@nestjs/common';
import { validateOrReject } from 'class-validator';
import { plainToInstance } from 'class-transformer';

import { ArchiveStoreProductDto } from '../repository/dto/archive-store-product.dto';
import { CreateStoreProductDto } from '../repository/dto/create-store-product.dto';
import { UpdateStoreProductDto } from '../repository/dto/update-store-product.dto';
import { StoreProductRepository } from '../repository/store-product.repository';
import { StoreProductResultEntity } from '../store-product.entity';

@Injectable()
export class StoreProductService {
  constructor(private readonly storeProductRepository: StoreProductRepository) {}

  async findAll(query: any) {
    const result = await this.storeProductRepository.findAllAndCount(query).then(({ data, count }) => {
      return {
        data,
        meta: {
          totalRows: count,
        },
      };
    });

    const resultInstance = plainToInstance(StoreProductResultEntity, result, {
      strategy: 'excludeAll',
    });

    await validateOrReject(resultInstance);

    return resultInstance;
  }

  findByUuid(uuid: string) {
    return this.storeProductRepository.findByUuid(uuid);
  }

  create(dto: CreateStoreProductDto) {
    return this.storeProductRepository.create(dto);
  }

  update(dto: UpdateStoreProductDto) {
    return this.storeProductRepository.update(dto);
  }

  archive(dto: ArchiveStoreProductDto) {
    return this.storeProductRepository.archive(dto);
  }
}
