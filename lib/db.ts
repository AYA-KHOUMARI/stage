import mysql, { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

let pool: Pool | undefined;

export function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'inventory_app',
      password: process.env.DB_PASSWORD || 'inventory_password',
      database: process.env.DB_NAME || 'inventory_reconciliation',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      dateStrings: false
    });
  }
  return pool;
}

export type DbRow = RowDataPacket & Record<string, unknown>;
export type DbResult = ResultSetHeader;
