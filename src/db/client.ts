import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';
import * as schema from './schema';

export const expoDb = openDatabaseSync('kokomotowash.db');
export const db = drizzle(expoDb, { schema });
export type DbType = typeof db;
export * from './schema';
