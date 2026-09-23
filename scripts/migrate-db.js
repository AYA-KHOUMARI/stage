const mysql = require("mysql2/promise");

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "inventory_app",
    password: process.env.DB_PASSWORD || "inventory_password",
    database: process.env.DB_NAME || "inventory_reconciliation",
  });

  try {
    console.log("Starting database migration...");

    await connection.query(`
      CREATE TABLE IF NOT EXISTS app_users (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        username VARCHAR(100) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_app_users_username (username)
      ) ENGINE=InnoDB
    `);
    console.log("Authentication table is ready.");

    await connection.query(
      "ALTER TABLE app_users MODIFY id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT",
    );
    for (const statement of [
      "ALTER TABLE app_users ADD COLUMN recovery_email VARCHAR(255) NULL",
      "ALTER TABLE app_users ADD COLUMN recovery_code_hash CHAR(64) NULL",
      "ALTER TABLE app_users ADD COLUMN recovery_code_expires_at DATETIME NULL",
    ]) {
      try {
        await connection.query(statement);
      } catch (error) {
        if (error.code !== "ER_DUP_FIELDNAME") throw error;
      }
    }

    // 1. Temporarily change ENUM columns to VARCHAR
    // This allows us to safely convert the old status values.
    await connection.query(`
      ALTER TABLE inventory_items
      MODIFY result_status VARCHAR(50) NOT NULL DEFAULT 'Non_Trouvé'
    `);

    await connection.query(`
      ALTER TABLE comparison_results
      MODIFY result_status VARCHAR(50) NOT NULL
    `);

    console.log("Temporary VARCHAR conversion completed.");

    // 2. Convert old status names to the new names
    await connection.query(`
      UPDATE inventory_items
      SET result_status =
        CASE
          WHEN result_status = 'DONE' THEN 'Traité'
          WHEN result_status = 'DEPLACE' THEN 'Deplacé'
          WHEN result_status = 'NON_TROUVE' THEN 'Non_Trouvé'
          WHEN result_status = '' OR result_status IS NULL THEN 'Non_Trouvé'
          ELSE result_status
        END
    `);

    await connection.query(`
      UPDATE comparison_results
      SET result_status =
        CASE
          WHEN result_status = 'DONE' THEN 'Traité'
          WHEN result_status = 'DEPLACE' THEN 'Deplacé'
          WHEN result_status = 'NON_TROUVE' THEN 'Non_Trouvé'
          WHEN result_status = '' OR result_status IS NULL THEN 'Non_Trouvé'
          ELSE result_status
        END
    `);

    console.log("Old status values converted.");

    // 3. Convert VARCHAR back to the new ENUM
    await connection.query(`
      ALTER TABLE inventory_items
      MODIFY result_status
      ENUM('Traité','Deplacé','Non_Trouvé','Nouveau')
      NOT NULL DEFAULT 'Non_Trouvé'
    `);

    await connection.query(`
      ALTER TABLE comparison_results
      MODIFY result_status
      ENUM('Traité','Deplacé','Non_Trouvé','Nouveau')
      NOT NULL
    `);

    console.log("Database migration completed successfully.");
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("Database migration failed:", error.message);
  process.exit(1);
});
