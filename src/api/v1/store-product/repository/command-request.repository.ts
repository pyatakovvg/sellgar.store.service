import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { instanceToPlain, plainToInstance, ClassConstructor } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import { CommandRequestModel } from '../model/command-request.model';

@Injectable()
export class CommandRequestRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}
  async execute<T extends object>(
    command: { commandId: string },
    commandType: string,
    resultType: ClassConstructor<T>,
    operation: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    const requestHash = createHash('sha256')
      .update(JSON.stringify(this.sortKeys({ commandType, ...instanceToPlain(command) })))
      .digest('hex');
    try {
      return await this.dataSource.transaction(async (manager) => {
        // Serialize identical command ids even before their first result is inserted.
        await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [command.commandId]);
        const existing = await manager.findOneBy(CommandRequestModel, { commandId: command.commandId });
        if (existing) {
          if (existing.commandType !== commandType || existing.requestHash !== requestHash)
            throw new ConflictException('Command id was already used with another request');
          const result = plainToInstance(resultType, existing.result, { excludeExtraneousValues: true });
          await validateOrReject(result);
          return result;
        }
        const result = await operation(manager);
        await validateOrReject(result);
        await manager.insert(CommandRequestModel, {
          commandId: command.commandId,
          commandType,
          requestHash,
          status: 'completed',
          result: instanceToPlain(result),
        });
        return result;
      });
    } catch (error) {
      if (error instanceof QueryFailedError) {
        const code = (error.driverError as { code?: string }).code;
        if (code === '23505') throw new ConflictException('Article or variant association already exists');
        if (code === '23503' || code === '23514')
          throw new BadRequestException('Invalid record reference or stock state');
      }
      throw error;
    }
  }
  private sortKeys(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => this.sortKeys(item));
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, item]) => [key, this.sortKeys(item)]),
      );
    return value;
  }
}
