const { resolve } = require('node:path');

// Match the current User entity without rewriting existing account/password columns.
const profileColumns = {
  birth_date: 'DATE NULL',
  address: 'TEXT NULL',
  avatar_url: 'VARCHAR(500) NULL',
  gender: "ENUM('male', 'female', 'other') NULL",
  card_holder: 'VARCHAR(100) NULL',
  card_type: 'VARCHAR(20) NULL',
  card_provider: 'VARCHAR(40) NULL',
  card_last4: 'CHAR(4) NULL',
  card_exp_month: 'TINYINT UNSIGNED NULL',
  card_exp_year: 'SMALLINT UNSIGNED NULL',
  transaction_pin_hash: 'VARCHAR(255) NULL',
  transaction_pin_failed_attempts: 'TINYINT UNSIGNED NOT NULL DEFAULT 0',
  transaction_pin_locked_until: 'DATETIME NULL',
};

async function upgradeAuthProfile(connection) {
  const [columns] = await connection.query('SHOW COLUMNS FROM users');
  const missing = Object.entries(profileColumns).filter(([name]) => !columns.some(column => column.Field === name));
  if (missing.length) await connection.query('ALTER TABLE users ' + missing.map(([name, definition]) => `ADD COLUMN ${name} ${definition}`).join(', '));
  const [updated] = await connection.query('SHOW COLUMNS FROM users');
  if (Object.keys(profileColumns).some(name => !updated.some(column => column.Field === name))) throw { code: 'INCOMPLETE_AUTH_SCHEMA' };
  return missing.map(([name]) => name);
}

async function setup() {
  process.loadEnvFile(resolve(__dirname, '../.env'));
  const connection = await require('mysql2/promise').createConnection({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME, ssl: { rejectUnauthorized: false },
    connectTimeout: 10000, charset: 'utf8mb4',
  });
  try {
    const [[lock]] = await connection.query("SELECT GET_LOCK('giadung_auth_profile_upgrade', 10) AS acquired");
    if (Number(lock.acquired) !== 1) throw { code: 'MIGRATION_BUSY' };
    const added = await upgradeAuthProfile(connection);
    console.log('User schema ready. Columns added: ' + (added.join(', ') || 'none (already up to date)') + '. Existing accounts/passwords are unchanged.');
  } finally {
    await connection.query("SELECT RELEASE_LOCK('giadung_auth_profile_upgrade')").catch(() => {});
    await connection.end();
  }
}
module.exports = { upgradeAuthProfile, profileColumns };
if (require.main === module) setup().catch(error => {
  console.error('User schema upgrade failed: ' + (error.code || 'UNKNOWN') + '. No account reset is performed.');
  process.exitCode = 1;
});
