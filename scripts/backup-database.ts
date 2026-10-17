import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

dotenv.config();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not set in .env');
  process.exit(1);
}

const sql = neon(databaseUrl);

function timestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = now.getFullYear();
  const mm = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  const hh = pad(now.getHours());
  const min = pad(now.getMinutes());
  const ss = pad(now.getSeconds());
  return `${yyyy}${mm}${dd}_${hh}${min}${ss}`;
}

function escapeSqlValue(val: unknown): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (val instanceof Date) return `'${val.toISOString()}'`;
  if (typeof val === 'object') {
    const jsonStr = JSON.stringify(val).replace(/'/g, "''");
    return `'${jsonStr}'::jsonb`;
  }
  const str = String(val).replace(/'/g, "''");
  return `'${str}'`;
}

async function runBackup() {
  const ts = timestamp();
  const backupsDir = path.resolve(process.cwd(), 'backups');
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }

  const schemaFile = path.join(backupsDir, `architecture_schema_backup_${ts}.sql`);
  const fullSqlFile = path.join(backupsDir, `full_database_backup_${ts}.sql`);
  const fullJsonFile = path.join(backupsDir, `full_database_backup_${ts}.json`);

  console.log(`[backup] Starting database backup (${ts})...`);

  // 1. Fetch ENUMs
  console.log('[backup] Extracting custom ENUM types...');
  const enums = await sql`
    SELECT t.typname, string_agg(quote_literal(e.enumlabel), ', ' ORDER BY e.enumsortorder) AS enum_values
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
    GROUP BY t.typname
    ORDER BY t.typname;
  `;

  let ddl = `-- ==================================================================\n`;
  ddl += `-- Oryxa Database Architecture / Schema Backup\n`;
  ddl += `-- Generated at: ${new Date().toISOString()}\n`;
  ddl += `-- Source: ${databaseUrl.replace(/:[^:@]+@/, ':****@')}\n`;
  ddl += `-- ==================================================================\n\n`;

  if (enums.length > 0) {
    ddl += `-- ENUM Types\n`;
    for (const e of enums) {
      ddl += `DO $$ BEGIN\n`;
      ddl += `  CREATE TYPE "${e.typname}" AS ENUM (${e.enum_values});\n`;
      ddl += `EXCEPTION\n`;
      ddl += `  WHEN duplicate_object THEN null;\n`;
      ddl += `END $$;\n\n`;
    }
  }

  // 2. Fetch all tables
  console.log('[backup] Extracting table schemas...');
  const tables = await sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `;

  const allData: Record<string, unknown[]> = {};
  let insertStatements = `-- ==================================================================\n`;
  insertStatements += `-- Oryxa Full Data Backup (INSERT statements)\n`;
  insertStatements += `-- Generated at: ${new Date().toISOString()}\n`;
  insertStatements += `-- ==================================================================\n\n`;
  insertStatements += `SET statement_timeout = 0;\n`;
  insertStatements += `SET client_encoding = 'UTF8';\n`;
  insertStatements += `SET standard_conforming_strings = on;\n\n`;

  // Fetch column info for each table
  for (const t of tables) {
    const tableName = t.table_name;
    const columns = await sql`
      SELECT 
        column_name, 
        data_type, 
        udt_name,
        is_nullable, 
        column_default,
        character_maximum_length,
        numeric_precision,
        numeric_scale
      FROM information_schema.columns
      WHERE table_schema = 'public' 
        AND table_name = ${tableName}
      ORDER BY ordinal_position;
    `;

    ddl += `-- Table: public.${tableName}\n`;
    ddl += `CREATE TABLE IF NOT EXISTS "${tableName}" (\n`;
    const colDefs: string[] = [];
    for (const col of columns) {
      let typeStr = col.data_type.toUpperCase();
      if (typeStr === 'USER-DEFINED') {
        typeStr = `"${col.udt_name}"`;
      } else if (typeStr === 'CHARACTER VARYING') {
        typeStr = col.character_maximum_length ? `VARCHAR(${col.character_maximum_length})` : 'VARCHAR';
      } else if (typeStr === 'NUMERIC') {
        typeStr = col.numeric_precision ? `NUMERIC(${col.numeric_precision}, ${col.numeric_scale ?? 0})` : 'NUMERIC';
      }

      let def = `  "${col.column_name}" ${typeStr}`;
      if (col.column_default) {
        def += ` DEFAULT ${col.column_default}`;
      }
      if (col.is_nullable === 'NO') {
        def += ` NOT NULL`;
      }
      colDefs.push(def);
    }
    ddl += colDefs.join(',\n');
    ddl += `\n);\n\n`;

    // Fetch Table Data
    const rows = await sql(`SELECT * FROM "${tableName}"`);
    allData[tableName] = rows;
    console.log(`[backup] Dumped ${tableName}: ${rows.length} rows`);

    if (rows.length > 0) {
      insertStatements += `-- Data for ${tableName} (${rows.length} rows)\n`;
      const colNames = Object.keys(rows[0]);
      const quotedCols = colNames.map((c) => `"${c}"`).join(', ');

      for (const row of rows) {
        const values = colNames.map((c) => escapeSqlValue(row[c])).join(', ');
        insertStatements += `INSERT INTO "${tableName}" (${quotedCols}) VALUES (${values}) ON CONFLICT DO NOTHING;\n`;
      }
      insertStatements += `\n`;
    }
  }

  // 3. Fetch Primary Keys & Unique Constraints
  console.log('[backup] Extracting primary keys and constraints...');
  const constraints = await sql`
    SELECT 
      conname,
      contype,
      conrelid::regclass::text as table_name,
      pg_get_constraintdef(c.oid) as definition
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'public'
    ORDER BY contype, conname;
  `;

  ddl += `-- Constraints (Primary Keys, Foreign Keys, Unique)\n`;
  for (const c of constraints) {
    ddl += `ALTER TABLE ${c.table_name} ADD CONSTRAINT "${c.conname}" ${c.definition};\n`;
  }
  ddl += `\n`;

  // 4. Fetch Indexes
  console.log('[backup] Extracting indexes...');
  const indexes = await sql`
    SELECT indexname, tablename, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname NOT IN (SELECT conname FROM pg_constraint)
    ORDER BY tablename, indexname;
  `;

  ddl += `-- Indexes\n`;
  for (const idx of indexes) {
    ddl += `${idx.indexdef};\n`;
  }
  ddl += `\n`;

  // Write Architecture DDL file
  fs.writeFileSync(schemaFile, ddl, 'utf8');
  console.log(`[backup] Architecture backup written to: ${schemaFile}`);

  // Write Full SQL backup file (DDL + Inserts)
  const fullSqlContent = `${ddl}\n\n${insertStatements}`;
  fs.writeFileSync(fullSqlFile, fullSqlContent, 'utf8');
  console.log(`[backup] Full database SQL backup written to: ${fullSqlFile}`);

  // Write Full JSON backup file (All tables and rows)
  fs.writeFileSync(fullJsonFile, JSON.stringify(allData, null, 2), 'utf8');
  console.log(`[backup] Full database JSON backup written to: ${fullJsonFile}`);

  console.log('\n[backup] SUMMARY:');
  console.log(`- Architecture SQL Backup: ${schemaFile} (${(fs.statSync(schemaFile).size / 1024).toFixed(1)} KB)`);
  console.log(`- Full Database SQL Backup: ${fullSqlFile} (${(fs.statSync(fullSqlFile).size / 1024).toFixed(1)} KB)`);
  console.log(`- Full Database JSON Backup: ${fullJsonFile} (${(fs.statSync(fullJsonFile).size / 1024).toFixed(1)} KB)`);
  console.log('- Total tables backed up:', tables.length);
}

runBackup()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[backup] Failed:', err);
    process.exit(1);
  });
