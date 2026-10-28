import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getMetadataArgsStorage } from 'typeorm';
import { User } from '../../backend/src/database/entities/user.entity';

const { upgradeAuthProfile, profileColumns } = require('../../backend/scripts/setup-auth-profile.cjs');
const baseColumns = ['id', 'full_name', 'username', 'email', 'password', 'phone', 'role', 'created_at', 'updated_at'];

test('legacy users schema upgrades once using ADD only, and covers every User column', async () => {
  const columns = new Set(baseColumns); const statements: string[] = [];
  const connection = { query: async (sql: string) => {
    statements.push(sql);
    if (sql === 'SHOW COLUMNS FROM users') return [[...columns].map(Field => ({ Field }))];
    assert.match(sql, /^ALTER TABLE users ADD COLUMN /);
    assert.doesNotMatch(sql, /\b(DROP|MODIFY|CHANGE|DELETE|UPDATE|INSERT|TRUNCATE)\b/i);
    const additions = [...sql.matchAll(/ADD COLUMN ([a-z0-9_]+) /g)].map(match => match[1]);
    assert.equal(additions.length, 13);
    for (const column of additions) { assert.ok(!baseColumns.includes(column)); assert.ok(!columns.has(column)); columns.add(column); }
    return [[]];
  } };
  assert.equal((await upgradeAuthProfile(connection)).length, 13);
  assert.deepEqual(await upgradeAuthProfile(connection), []);
  assert.equal(statements.filter(sql => sql.startsWith('ALTER')).length, 1);
  for (const column of getMetadataArgsStorage().columns.filter(column => column.target === User)) assert.ok(columns.has(column.options.name ?? column.propertyName));
  const schema = readFileSync(resolve(__dirname, '../../database/schema.sql'), 'utf8').match(/CREATE TABLE IF NOT EXISTS users \(([\s\S]+?)\) ENGINE/)![1];
  for (const name of Object.keys(profileColumns)) assert.match(schema, new RegExp(`\\b${name}\\s+`, 'i'));
});

test('partially upgraded schema adds only missing fields, and a failed ALTER never reports success', async () => {
  const columns = new Set([...baseColumns, ...Object.keys(profileColumns).filter(name => name !== 'birth_date')]);
  let altered = '';
  const connection = { query: async (sql: string) => {
    if (sql === 'SHOW COLUMNS FROM users') return [[...columns].map(Field => ({ Field }))];
    altered = sql; columns.add('birth_date'); return [[]];
  } };
  assert.deepEqual(await upgradeAuthProfile(connection), ['birth_date']);
  assert.equal(altered, 'ALTER TABLE users ADD COLUMN birth_date DATE NULL');
  await assert.rejects(upgradeAuthProfile({ query: async (sql: string) => {
    if (sql === 'SHOW COLUMNS FROM users') return [baseColumns.map(Field => ({ Field }))];
    throw new Error('fixture ALTER failed');
  } }), /fixture ALTER failed/);
});
