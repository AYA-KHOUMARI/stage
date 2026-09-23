const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

(async () => {
  const connectionUrl = process.env.DB_URL || process.env.MYSQL_PUBLIC_URL;
  const conn = await mysql.createConnection(
    connectionUrl || {
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'inventory_app',
      password: process.env.DB_PASSWORD || 'inventory_password',
      multipleStatements: true
    }
  );
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  await conn.query(sql);
  await conn.end();
  console.log('MySQL schema initialized.');
})().catch((err) => { console.error(err); process.exit(1); });
