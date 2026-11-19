import { Injectable, BadRequestException } from '@nestjs/common';
import { ClassConstructor, plainToInstance } from 'class-transformer';
import { validateOrReject, ValidationError } from 'class-validator';

@Injectable()
export class CommandFactory {
  async create<T extends object>(type: ClassConstructor<T>, input: object): Promise<T> {
    const command = plainToInstance(type, input, { excludeExtraneousValues: true });
    try {
      await validateOrReject(command, { whitelist: true, forbidNonWhitelisted: true });
    } catch (error) {
      if (Array.isArray(error) && error.every((item) => item instanceof ValidationError))
        throw new BadRequestException(error);
      throw error;
    }
    return command;
  }
}
