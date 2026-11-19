import { existsSync } from 'node:fs';
import { DataSource } from 'typeorm';
import { StoreDatabaseOptions } from './store-database.options';
if (existsSync('.env')) process.loadEnvFile('.env');
export default new DataSource(StoreDatabaseOptions.create(process.env));
