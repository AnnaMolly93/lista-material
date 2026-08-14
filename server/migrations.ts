import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { DEFAULT_ENXOVAL_TEMPLATE_NAME, DEFAULT_TEMPLATE_CATEGORIES, DEFAULT_TEMPLATE_ITEMS } from '../src/data.ts';
import { getPool } from './database.ts';

interface UserRow {
  id: string;
  name: string;
}

interface EnxovalRow {
  id: string;
}

interface TemplateRow {
  id: string;
}

async function seedDefaultTemplate(pool: Pool) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const existingTemplate = await client.query<TemplateRow>(`
      SELECT id
      FROM enxoval_templates
      WHERE is_default = true OR name = $1
      ORDER BY is_default DESC, created_at ASC
      LIMIT 1
    `, [DEFAULT_ENXOVAL_TEMPLATE_NAME]);

    const templateId = existingTemplate.rows[0]?.id ?? randomUUID();

    if (existingTemplate.rows[0]) {
      await client.query(`
        UPDATE enxoval_templates
        SET name = $1, is_default = true, updated_at = now()
        WHERE id = $2
      `, [DEFAULT_ENXOVAL_TEMPLATE_NAME, templateId]);
    } else {
      await client.query(`
        INSERT INTO enxoval_templates (id, name, is_default)
        VALUES ($1, $2, true)
      `, [templateId, DEFAULT_ENXOVAL_TEMPLATE_NAME]);
    }

    await client.query(`
      UPDATE enxoval_templates
      SET is_default = false, updated_at = now()
      WHERE id <> $1 AND is_default = true
    `, [templateId]);

    await client.query('DELETE FROM template_categories WHERE template_id = $1', [templateId]);

    const categoryIds = new Map<string, string>();

    for (const [index, categoryName] of DEFAULT_TEMPLATE_CATEGORIES.entries()) {
      const categoryId = randomUUID();
      await client.query(`
        INSERT INTO template_categories (id, template_id, name, sort_order)
        VALUES ($1, $2, $3, $4)
      `, [categoryId, templateId, categoryName, index]);
      categoryIds.set(categoryName, categoryId);
    }

    const itemOrdersByCategory = new Map<string, number>();

    for (const item of DEFAULT_TEMPLATE_ITEMS) {
      const categoryId = categoryIds.get(item.category);
      if (!categoryId) continue;

      const sortOrder = itemOrdersByCategory.get(item.category) ?? 0;
      itemOrdersByCategory.set(item.category, sortOrder + 1);

      await client.query(`
        INSERT INTO template_items (id, template_id, category_id, name, sort_order)
        VALUES ($1, $2, $3, $4, $5)
      `, [randomUUID(), templateId, categoryId, item.name, sortOrder]);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function migrateDatabase() {
  const pool = getPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id uuid PRIMARY KEY,
      name text NOT NULL,
      email text NOT NULL UNIQUE,
      password_hash text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash text NOT NULL UNIQUE,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS enxovais (
      id uuid PRIMARY KEY,
      name text NOT NULL,
      owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      discount_cents integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS enxoval_members (
      enxoval_id uuid NOT NULL REFERENCES enxovais(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role text NOT NULL CHECK (role IN ('owner', 'editor')),
      invited_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (enxoval_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS categories (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name text NOT NULL,
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS items (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      name text NOT NULL,
      checked boolean NOT NULL DEFAULT false,
      link text NOT NULL DEFAULT '',
      description text NOT NULL DEFAULT '',
      price_cents integer,
      planned_quantity integer NOT NULL DEFAULT 1,
      acquired_quantity integer NOT NULL DEFAULT 0,
      estimated_min_unit_price_cents integer,
      estimated_max_unit_price_cents integer,
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS enxoval_templates (
      id uuid PRIMARY KEY,
      name text NOT NULL UNIQUE,
      is_default boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS template_categories (
      id uuid PRIMARY KEY,
      template_id uuid NOT NULL REFERENCES enxoval_templates(id) ON DELETE CASCADE,
      name text NOT NULL,
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (template_id, name)
    );

    CREATE TABLE IF NOT EXISTS template_items (
      id uuid PRIMARY KEY,
      template_id uuid NOT NULL REFERENCES enxoval_templates(id) ON DELETE CASCADE,
      category_id uuid NOT NULL REFERENCES template_categories(id) ON DELETE CASCADE,
      name text NOT NULL,
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS material_imports (
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      import_key text NOT NULL,
      enxoval_id uuid NOT NULL REFERENCES enxovais(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, import_key)
    );

    ALTER TABLE enxovais ADD COLUMN IF NOT EXISTS discount_cents integer NOT NULL DEFAULT 0;
    ALTER TABLE enxovais ADD COLUMN IF NOT EXISTS budget_cents integer NOT NULL DEFAULT 0;
    ALTER TABLE enxovais DROP CONSTRAINT IF EXISTS enxovais_discount_cents_non_negative;
    ALTER TABLE enxovais ADD CONSTRAINT enxovais_discount_cents_non_negative CHECK (discount_cents >= 0);
    ALTER TABLE enxovais DROP CONSTRAINT IF EXISTS enxovais_budget_cents_non_negative;
    ALTER TABLE enxovais ADD CONSTRAINT enxovais_budget_cents_non_negative CHECK (budget_cents >= 0);
    ALTER TABLE categories ADD COLUMN IF NOT EXISTS enxoval_id uuid REFERENCES enxovais(id) ON DELETE CASCADE;
    ALTER TABLE items ADD COLUMN IF NOT EXISTS enxoval_id uuid REFERENCES enxovais(id) ON DELETE CASCADE;
    ALTER TABLE items ADD COLUMN IF NOT EXISTS price_cents integer;
    ALTER TABLE items ADD COLUMN IF NOT EXISTS planned_quantity integer NOT NULL DEFAULT 1;
    ALTER TABLE items ADD COLUMN IF NOT EXISTS acquired_quantity integer NOT NULL DEFAULT 0;
    ALTER TABLE items ADD COLUMN IF NOT EXISTS estimated_min_unit_price_cents integer;
    ALTER TABLE items ADD COLUMN IF NOT EXISTS estimated_max_unit_price_cents integer;
    ALTER TABLE items DROP CONSTRAINT IF EXISTS items_price_cents_non_negative;
    ALTER TABLE items ADD CONSTRAINT items_price_cents_non_negative CHECK (price_cents IS NULL OR price_cents >= 0);
    ALTER TABLE items DROP CONSTRAINT IF EXISTS items_planned_quantity_positive;
    ALTER TABLE items ADD CONSTRAINT items_planned_quantity_positive CHECK (planned_quantity > 0);
    ALTER TABLE items DROP CONSTRAINT IF EXISTS items_acquired_quantity_valid;
    ALTER TABLE items ADD CONSTRAINT items_acquired_quantity_valid CHECK (acquired_quantity >= 0 AND acquired_quantity <= planned_quantity);
    ALTER TABLE items DROP CONSTRAINT IF EXISTS items_estimated_min_price_valid;
    ALTER TABLE items ADD CONSTRAINT items_estimated_min_price_valid CHECK (estimated_min_unit_price_cents IS NULL OR estimated_min_unit_price_cents >= 0);
    ALTER TABLE items DROP CONSTRAINT IF EXISTS items_estimated_max_price_valid;
    ALTER TABLE items ADD CONSTRAINT items_estimated_max_price_valid CHECK (estimated_max_unit_price_cents IS NULL OR estimated_max_unit_price_cents >= 0);
    ALTER TABLE items DROP CONSTRAINT IF EXISTS items_estimated_price_range_valid;
    ALTER TABLE items ADD CONSTRAINT items_estimated_price_range_valid CHECK (
      estimated_min_unit_price_cents IS NULL
      OR estimated_max_unit_price_cents IS NULL
      OR estimated_min_unit_price_cents <= estimated_max_unit_price_cents
    );

    UPDATE items
    SET
      estimated_min_unit_price_cents = COALESCE(estimated_min_unit_price_cents, price_cents),
      estimated_max_unit_price_cents = COALESCE(estimated_max_unit_price_cents, price_cents),
      acquired_quantity = CASE WHEN checked THEN planned_quantity ELSE acquired_quantity END;

    UPDATE items
    SET checked = acquired_quantity >= planned_quantity;

    ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_user_name_unique;

    CREATE INDEX IF NOT EXISTS sessions_token_hash_idx ON sessions(token_hash);
    CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS enxovais_owner_id_idx ON enxovais(owner_id);
    CREATE INDEX IF NOT EXISTS enxoval_members_user_id_idx ON enxoval_members(user_id);
    CREATE INDEX IF NOT EXISTS categories_user_id_idx ON categories(user_id);
    CREATE INDEX IF NOT EXISTS categories_enxoval_id_idx ON categories(enxoval_id);
    CREATE UNIQUE INDEX IF NOT EXISTS categories_enxoval_name_unique ON categories(enxoval_id, name);
    CREATE INDEX IF NOT EXISTS items_user_id_idx ON items(user_id);
    CREATE INDEX IF NOT EXISTS items_category_id_idx ON items(category_id);
    CREATE INDEX IF NOT EXISTS items_enxoval_id_idx ON items(enxoval_id);
    CREATE INDEX IF NOT EXISTS material_imports_enxoval_id_idx ON material_imports(enxoval_id);
    CREATE UNIQUE INDEX IF NOT EXISTS enxoval_templates_single_default_idx ON enxoval_templates(is_default) WHERE is_default;
    CREATE INDEX IF NOT EXISTS template_categories_template_id_idx ON template_categories(template_id);
    CREATE INDEX IF NOT EXISTS template_items_template_id_idx ON template_items(template_id);
    CREATE INDEX IF NOT EXISTS template_items_category_id_idx ON template_items(category_id);
  `);

  await seedDefaultTemplate(pool);

  const usersResult = await pool.query<UserRow>(`
    SELECT DISTINCT u.id, u.name
    FROM users u
    WHERE EXISTS (SELECT 1 FROM categories c WHERE c.user_id = u.id AND c.enxoval_id IS NULL)
       OR EXISTS (SELECT 1 FROM items i WHERE i.user_id = u.id AND i.enxoval_id IS NULL)
  `);

  for (const user of usersResult.rows) {
    const existingResult = await pool.query<EnxovalRow>(`
      SELECT e.id
      FROM enxovais e
      INNER JOIN enxoval_members em ON em.enxoval_id = e.id
      WHERE em.user_id = $1 AND em.role = 'owner'
      ORDER BY e.created_at ASC
      LIMIT 1
    `, [user.id]);

    const enxovalId = existingResult.rows[0]?.id ?? randomUUID();

    if (!existingResult.rows[0]) {
      await pool.query(`
        INSERT INTO enxovais (id, name, owner_id)
        VALUES ($1, $2, $3)
      `, [enxovalId, 'Lista de Material', user.id]);
    }

    await pool.query(`
      INSERT INTO enxoval_members (enxoval_id, user_id, role)
      VALUES ($1, $2, 'owner')
      ON CONFLICT (enxoval_id, user_id) DO UPDATE SET role = 'owner'
    `, [enxovalId, user.id]);

    await pool.query(`
      UPDATE categories
      SET enxoval_id = $1
      WHERE user_id = $2 AND enxoval_id IS NULL
    `, [enxovalId, user.id]);

    await pool.query(`
      UPDATE items
      SET enxoval_id = $1
      WHERE user_id = $2 AND enxoval_id IS NULL
    `, [enxovalId, user.id]);
  }

  await pool.query(`
    ALTER TABLE categories ALTER COLUMN enxoval_id SET NOT NULL;
    ALTER TABLE items ALTER COLUMN enxoval_id SET NOT NULL;
  `);
}
