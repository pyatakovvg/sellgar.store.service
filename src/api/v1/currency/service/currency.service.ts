import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';

import { CreateCurrencyDto } from './dto/create-currency.dto';
import { UpdateCurrencyDto } from './dto/update-currency.dto';

import { CurrencyRepository } from '../repository/currency.repository';
import { CurrencyResultEntity } from '../currency.entity';

@Injectable()
export class CurrencyService {
  constructor(private readonly currencyRepository: CurrencyRepository) {}

  async findAll() {
    const result = await Promise.all([this.currencyRepository.findAll(), this.currencyRepository.count()]).then(
      ([data, count]) => {
        return {
          data,
          meta: {
            totalRows: count,
          },
        };
      },
    );

    const resultInstance = plainToInstance(CurrencyResultEntity, result, {
      strategy: 'excludeAll',
    });

    await validateOrReject(resultInstance);

    return resultInstance;
  }

  findByCode(code: string) {
    return this.currencyRepository.findByCode(code);
  }

  create(dto: CreateCurrencyDto) {
    return this.currencyRepository.create(dto);
  }

  update(dto: UpdateCurrencyDto) {
    return this.currencyRepository.update(dto);
  }

  remove(code: string) {
    return this.currencyRepository.remove(code);
  }
}
