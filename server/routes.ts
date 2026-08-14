import { randomBytes, randomUUID, scrypt as scryptCallback, createHash, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import express, { Express, Request, Response } from 'express';
import type { PoolClient } from 'pg';
import type { AuthUser, BootstrapData, EnxovalCategory, EnxovalItem, EnxovalMember, EnxovalSummary, EnxovalWorkspace } from '../src/types.ts';
import { getPool, Queryable } from './database.ts';

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = 'enxoval_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

interface DbUserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
}

interface EnxovalRow {
  id: string;
  name: string;
  owner_id: string;
  role: 'owner' | 'editor';
  discount_cents: number;
  budget_cents: number;
}

interface MemberRow {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'editor';
}

interface CategoryRow {
  id: string;
  name: string;
  sort_order: number;
}

interface ItemRow {
  id: string;
  name: string;
  category_id: string;
  category: string;
  checked: boolean;
  link: string;
  description: string;
  price_cents: number | null;
  planned_quantity: number;
  acquired_quantity: number;
  estimated_min_unit_price_cents: number | null;
  estimated_max_unit_price_cents: number | null;
  sort_order: number;
  updated_at: string | Date;
}

interface TemplateRow {
  id: string;
}

interface TemplateCategoryRow {
  id: string;
  name: string;
  sort_order: number;
}

interface TemplateItemRow {
  category_id: string;
  name: string;
  sort_order: number;
}

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function asyncHandler(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: express.NextFunction) => {
    Promise.resolve(handler(req, res)).catch(next);
  };
}

function normalizeEmail(email: unknown) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function requireText(value: unknown, fieldName: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpError(400, `${fieldName} é obrigatório.`);
  }

  return value.trim();
}

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = await scrypt(password, salt, 64) as Buffer;
  return `scrypt:${salt}:${derivedKey.toString('hex')}`;
}

async function verifyPassword(password: string, passwordHash: string) {
  const [scheme, salt, storedHash] = passwordHash.split(':');
  if (scheme !== 'scrypt' || !salt || !storedHash) return false;

  const derivedKey = await scrypt(password, salt, 64) as Buffer;
  const storedKey = Buffer.from(storedHash, 'hex');

  if (derivedKey.length !== storedKey.length) return false;
  return timingSafeEqual(derivedKey, storedKey);
}

function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function getCookie(req: Request, name: string) {
  const header = req.headers.cookie;
  if (!header) return '';

  const cookies = header.split(';').map(cookie => cookie.trim());
  const prefix = `${name}=`;
  const match = cookies.find(cookie => cookie.startsWith(prefix));
  return match ? decodeURIComponent(match.slice(prefix.length)) : '';
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.COOKIE_SECURE === 'true' || (process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false'),
    path: '/'
  };
}

function mapUser(row: Pick<DbUserRow, 'id' | 'name' | 'email'>): AuthUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email
  };
}

function mapEnxoval(row: EnxovalRow): EnxovalSummary {
  return {
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    role: row.role,
    discountCents: Number(row.discount_cents ?? 0),
    budgetCents: Number(row.budget_cents ?? 0)
  };
}

function mapMember(row: MemberRow): EnxovalMember {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role
  };
}

function serializeTimestamp(value: string | Date) {
  return value instanceof Date ? value.toISOString() : value;
}

function mapCategory(row: CategoryRow): EnxovalCategory {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order
  };
}

function mapItem(row: ItemRow): EnxovalItem {
  return {
    id: row.id,
    name: row.name,
    categoryId: row.category_id,
    category: row.category,
    checked: row.checked,
    link: row.link,
    description: row.description,
    priceCents: row.price_cents === null ? null : Number(row.price_cents),
    plannedQuantity: Number(row.planned_quantity ?? 1),
    acquiredQuantity: Number(row.acquired_quantity ?? 0),
    estimatedMinUnitPriceCents: row.estimated_min_unit_price_cents === null ? null : Number(row.estimated_min_unit_price_cents),
    estimatedMaxUnitPriceCents: row.estimated_max_unit_price_cents === null ? null : Number(row.estimated_max_unit_price_cents),
    sortOrder: row.sort_order,
    updatedAt: serializeTimestamp(row.updated_at)
  };
}

async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>) {
  const client = await getPool().connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function fetchEnxovais(queryable: Queryable, userId: string) {
  const result = await queryable.query<EnxovalRow>(`
    SELECT e.id, e.name, e.owner_id, e.discount_cents, e.budget_cents, em.role
    FROM enxovais e
    INNER JOIN enxoval_members em ON em.enxoval_id = e.id
    WHERE em.user_id = $1
    ORDER BY CASE em.role WHEN 'owner' THEN 0 ELSE 1 END, e.created_at ASC, e.name ASC
  `, [userId]);

  return result.rows.map(mapEnxoval);
}

async function requireEnxovalMember(queryable: Queryable, userId: string, enxovalId: string) {
  const result = await queryable.query<{ role: 'owner' | 'editor' }>(`
    SELECT role
    FROM enxoval_members
    WHERE enxoval_id = $1 AND user_id = $2
  `, [enxovalId, userId]);

  if (!result.rows[0]) throw new HttpError(404, 'Lista não encontrada.');
  return result.rows[0].role;
}
async function requireEnxovalOwner(queryable: Queryable, userId: string, enxovalId: string) {
  const role = await requireEnxovalMember(queryable, userId, enxovalId);
  if (role !== 'owner') throw new HttpError(403, 'Apenas o dono pode alterar esta lista.');
}

async function fetchEnxoval(queryable: Queryable, userId: string, enxovalId: string) {
  const result = await queryable.query<EnxovalRow>(`
    SELECT e.id, e.name, e.owner_id, e.discount_cents, e.budget_cents, em.role
    FROM enxovais e
    INNER JOIN enxoval_members em ON em.enxoval_id = e.id
    WHERE e.id = $1 AND em.user_id = $2
    LIMIT 1
  `, [enxovalId, userId]);

  if (!result.rows[0]) throw new HttpError(404, 'Lista não encontrada.');
  return mapEnxoval(result.rows[0]);
}

async function fetchMembers(queryable: Queryable, userId: string, enxovalId: string) {
  await requireEnxovalMember(queryable, userId, enxovalId);

  const result = await queryable.query<MemberRow>(`
    SELECT u.id, u.name, u.email, em.role
    FROM enxoval_members em
    INNER JOIN users u ON u.id = em.user_id
    WHERE em.enxoval_id = $1
    ORDER BY CASE em.role WHEN 'owner' THEN 0 ELSE 1 END, u.name ASC, u.email ASC
  `, [enxovalId]);

  return result.rows.map(mapMember);
}

async function fetchCategories(queryable: Queryable, userId: string, enxovalId: string) {
  await requireEnxovalMember(queryable, userId, enxovalId);

  const result = await queryable.query<CategoryRow>(`
    SELECT id, name, sort_order
    FROM categories
    WHERE enxoval_id = $1
    ORDER BY sort_order ASC, name ASC
  `, [enxovalId]);

  return result.rows.map(mapCategory);
}

async function fetchItems(queryable: Queryable, userId: string, enxovalId: string) {
  await requireEnxovalMember(queryable, userId, enxovalId);

  const result = await queryable.query<ItemRow>(`
    SELECT
      i.id,
      i.name,
      i.category_id,
      c.name AS category,
      i.checked,
      i.link,
      i.description,
      i.price_cents,
      i.planned_quantity,
      i.acquired_quantity,
      i.estimated_min_unit_price_cents,
      i.estimated_max_unit_price_cents,
      i.sort_order,
      i.updated_at
    FROM items i
    INNER JOIN categories c ON c.id = i.category_id
    WHERE i.enxoval_id = $1
    ORDER BY c.sort_order ASC, i.sort_order ASC, i.created_at ASC
  `, [enxovalId]);

  return result.rows.map(mapItem);
}

async function fetchWorkspace(queryable: Queryable, userId: string, enxovalId: string): Promise<EnxovalWorkspace> {
  const enxoval = await fetchEnxoval(queryable, userId, enxovalId);
  const members = await fetchMembers(queryable, userId, enxovalId);
  const categories = await fetchCategories(queryable, userId, enxovalId);
  const items = await fetchItems(queryable, userId, enxovalId);

  return { enxoval, members, categories, items };
}

async function fetchBootstrap(user: AuthUser, requestedEnxovalId?: string): Promise<BootstrapData> {
  const enxovais = await fetchEnxovais(getPool(), user.id);
  const activeEnxovalId = requestedEnxovalId ?? enxovais[0]?.id;
  const workspace = activeEnxovalId
    ? await fetchWorkspace(getPool(), user.id, activeEnxovalId)
    : null;

  return {
    user,
    enxovais,
    activeEnxoval: workspace?.enxoval ?? null,
    members: workspace?.members ?? [],
    categories: workspace?.categories ?? [],
    items: workspace?.items ?? []
  };
}

async function findCategory(queryable: Queryable, userId: string, enxovalId: string, categoryId: string) {
  await requireEnxovalMember(queryable, userId, enxovalId);

  const result = await queryable.query<CategoryRow>(`
    SELECT id, name, sort_order
    FROM categories
    WHERE id = $1 AND enxoval_id = $2
  `, [categoryId, enxovalId]);

  return result.rows[0] ? mapCategory(result.rows[0]) : null;
}

async function findOrCreateCategory(client: PoolClient, userId: string, enxovalId: string, name: string, preferredOrder?: number) {
  await requireEnxovalMember(client, userId, enxovalId);

  const orderResult = await client.query<{ next_order: number }>(`
    SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order
    FROM categories
    WHERE enxoval_id = $1
  `, [enxovalId]);

  const result = await client.query<CategoryRow>(`
    INSERT INTO categories (id, user_id, enxoval_id, name, sort_order)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (enxoval_id, name) DO UPDATE SET name = EXCLUDED.name
    RETURNING id, name, sort_order
  `, [randomUUID(), userId, enxovalId, name, preferredOrder ?? orderResult.rows[0]?.next_order ?? 0]);

  return mapCategory(result.rows[0]);
}

async function seedEnxovalDefaults(client: PoolClient, userId: string, enxovalId: string) {
  const templateResult = await client.query<TemplateRow>(`
    SELECT id
    FROM enxoval_templates
    WHERE is_default = true
    ORDER BY created_at ASC
    LIMIT 1
  `);

  const templateId = templateResult.rows[0]?.id;
  if (!templateId) return;

  const templateCategories = await client.query<TemplateCategoryRow>(`
    SELECT id, name, sort_order
    FROM template_categories
    WHERE template_id = $1
    ORDER BY sort_order ASC, name ASC
  `, [templateId]);

  const categoryIds = new Map<string, string>();

  for (const templateCategory of templateCategories.rows) {
    const category = await findOrCreateCategory(client, userId, enxovalId, templateCategory.name, templateCategory.sort_order);
    categoryIds.set(templateCategory.id, category.id);
  }

  const templateItems = await client.query<TemplateItemRow>(`
    SELECT category_id, name, sort_order
    FROM template_items
    WHERE template_id = $1
    ORDER BY sort_order ASC, name ASC
  `, [templateId]);

  for (const item of templateItems.rows) {
    const categoryId = categoryIds.get(item.category_id);
    if (!categoryId) continue;

    await client.query(`
      INSERT INTO items (id, user_id, enxoval_id, category_id, name, sort_order)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [randomUUID(), userId, enxovalId, categoryId, item.name, item.sort_order]);
  }
}

async function createEnxovalForUser(userId: string, name: string, options: { useDefaultTemplate?: boolean } = {}) {
  return withTransaction(async client => {
    const enxovalId = randomUUID();

    const enxovalResult = await client.query<EnxovalRow>(`
      INSERT INTO enxovais (id, name, owner_id)
      VALUES ($1, $2, $3)
      RETURNING id, name, owner_id, discount_cents, budget_cents, 'owner'::text AS role
    `, [enxovalId, name, userId]);

    await client.query(`
      INSERT INTO enxoval_members (enxoval_id, user_id, role)
      VALUES ($1, $2, 'owner')
    `, [enxovalId, userId]);

    if (options.useDefaultTemplate !== false) {
      await seedEnxovalDefaults(client, userId, enxovalId);
    }

    return fetchWorkspace(client, userId, enxovalResult.rows[0].id);
  });
}

async function createSession(res: Response, userId: string) {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await getPool().query(`
    INSERT INTO sessions (id, user_id, token_hash, expires_at)
    VALUES ($1, $2, $3, $4)
  `, [randomUUID(), userId, tokenHash, expiresAt]);

  res.cookie(SESSION_COOKIE, token, {
    ...cookieOptions(),
    maxAge: SESSION_TTL_MS
  });
}

async function getCurrentUser(req: Request) {
  const token = getCookie(req, SESSION_COOKIE);
  if (!token) return null;

  const result = await getPool().query<DbUserRow>(`
    SELECT u.id, u.name, u.email, u.password_hash
    FROM sessions s
    INNER JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = $1 AND s.expires_at > now()
    LIMIT 1
  `, [hashSessionToken(token)]);

  return result.rows[0] ? mapUser(result.rows[0]) : null;
}

async function requireCurrentUser(req: Request) {
  const user = await getCurrentUser(req);
  if (!user) throw new HttpError(401, 'Faça login para continuar.');
  return user;
}

async function createItemForUser(input: {
  userId: string;
  enxovalId: string;
  name: string;
  categoryId?: string;
  categoryName?: string;
  link?: string;
  description?: string;
  plannedQuantity?: number;
  estimatedMinUnitPriceCents?: number | null;
  estimatedMaxUnitPriceCents?: number | null;
}) {
  return withTransaction(async client => {
    await requireEnxovalMember(client, input.userId, input.enxovalId);

    let category: EnxovalCategory | null = null;

    if (input.categoryId) {
      category = await findCategory(client, input.userId, input.enxovalId, input.categoryId);
      if (!category) throw new HttpError(404, 'Categoria não encontrada.');
    } else if (input.categoryName) {
      category = await findOrCreateCategory(client, input.userId, input.enxovalId, input.categoryName);
    } else {
      category = await findOrCreateCategory(client, input.userId, input.enxovalId, 'Sem tipo');
    }

    const orderResult = await client.query<{ next_order: number }>(`
      SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order
      FROM items
      WHERE enxoval_id = $1 AND category_id = $2
    `, [input.enxovalId, category.id]);

    const itemId = randomUUID();
    await client.query(`
      INSERT INTO items (
        id, user_id, enxoval_id, category_id, name, link, description,
        price_cents, planned_quantity, acquired_quantity,
        estimated_min_unit_price_cents, estimated_max_unit_price_cents, checked, sort_order
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, $10, $11, false, $12)
    `, [
      itemId,
      input.userId,
      input.enxovalId,
      category.id,
      input.name,
      input.link ?? '',
      input.description ?? '',
      input.estimatedMinUnitPriceCents ?? null,
      input.plannedQuantity ?? 1,
      input.estimatedMinUnitPriceCents ?? null,
      input.estimatedMaxUnitPriceCents ?? input.estimatedMinUnitPriceCents ?? null,
      orderResult.rows[0]?.next_order ?? 0
    ]);

    const itemResult = await client.query<ItemRow>(`
      SELECT
        i.id,
        i.name,
        i.category_id,
        c.name AS category,
        i.checked,
        i.link,
        i.description,
        i.price_cents,
        i.planned_quantity,
        i.acquired_quantity,
        i.estimated_min_unit_price_cents,
        i.estimated_max_unit_price_cents,
        i.sort_order,
        i.updated_at
      FROM items i
      INNER JOIN categories c ON c.id = i.category_id
      WHERE i.id = $1 AND i.enxoval_id = $2
    `, [itemId, input.enxovalId]);

    return {
      item: mapItem(itemResult.rows[0]),
      category
    };
  });
}

interface ImportedMaterialInput {
  name: string;
  categoryName: string;
  plannedQuantity: number;
  acquiredQuantity: number;
  estimatedMinUnitPriceCents: number | null;
  estimatedMaxUnitPriceCents: number | null;
  link: string;
  description: string;
}

function optionalText(value: unknown, maxLength: number) {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string') throw new HttpError(400, 'Há um texto inválido na planilha.');
  return value.trim().slice(0, maxLength);
}

function optionalCents(value: unknown, fieldName: string) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new HttpError(400, `${fieldName} inválido na planilha.`);
  }
  return value;
}

function validateImportedMaterials(body: unknown) {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'Dados de importação inválidos.');
  const input = body as Record<string, unknown>;
  const name = requireText(input.name, 'Nome da matéria').slice(0, 120);

  if (!Array.isArray(input.materials) || input.materials.length === 0) {
    throw new HttpError(400, 'A planilha não contém materiais para importar.');
  }
  if (input.materials.length > 1000) throw new HttpError(400, 'A planilha pode ter no máximo 1.000 materiais.');

  const materials: ImportedMaterialInput[] = input.materials.map((raw, index) => {
    if (!raw || typeof raw !== 'object') throw new HttpError(400, `Material inválido na linha ${index + 2}.`);
    const material = raw as Record<string, unknown>;
    const materialName = requireText(material.name, `Material da linha ${index + 2}`).slice(0, 300);
    const categoryName = optionalText(material.categoryName, 120) || 'Sem tipo';
    const plannedQuantity = material.plannedQuantity;
    const acquiredQuantity = material.acquiredQuantity;

    if (typeof plannedQuantity !== 'number' || !Number.isInteger(plannedQuantity) || plannedQuantity < 1 || plannedQuantity > 10000) {
      throw new HttpError(400, `Quantidade inválida para “${materialName}”.`);
    }
    if (typeof acquiredQuantity !== 'number' || !Number.isInteger(acquiredQuantity) || acquiredQuantity < 0 || acquiredQuantity > plannedQuantity) {
      throw new HttpError(400, `Quantidade adquirida inválida para “${materialName}”.`);
    }

    const min = optionalCents(material.estimatedMinUnitPriceCents, `Valor mínimo de “${materialName}”`);
    const max = optionalCents(material.estimatedMaxUnitPriceCents, `Valor máximo de “${materialName}”`) ?? min;
    if (min !== null && max !== null && min > max) throw new HttpError(400, `O valor mínimo de “${materialName}” é maior que o máximo.`);

    return {
      name: materialName,
      categoryName,
      plannedQuantity,
      acquiredQuantity,
      estimatedMinUnitPriceCents: min,
      estimatedMaxUnitPriceCents: max,
      link: optionalText(material.link, 2000),
      description: optionalText(material.description, 2000)
    };
  });

  return { name, materials };
}

async function importExcelForUser(userId: string, body: unknown) {
  const input = validateImportedMaterials(body);
  return withTransaction(async client => {
    const enxovalId = randomUUID();
    await client.query(`
      INSERT INTO enxovais (id, name, owner_id)
      VALUES ($1, $2, $3)
    `, [enxovalId, input.name, userId]);
    await client.query(`
      INSERT INTO enxoval_members (enxoval_id, user_id, role)
      VALUES ($1, $2, 'owner')
    `, [enxovalId, userId]);

    const categories = new Map<string, EnxovalCategory>();
    for (const [sortOrder, material] of input.materials.entries()) {
      const categoryKey = material.categoryName.toLocaleLowerCase('pt-BR');
      let category = categories.get(categoryKey);
      if (!category) {
        category = await findOrCreateCategory(client, userId, enxovalId, material.categoryName, categories.size);
        categories.set(categoryKey, category);
      }

      await client.query(`
        INSERT INTO items (
          id, user_id, enxoval_id, category_id, name, link, description, price_cents,
          planned_quantity, acquired_quantity,
          estimated_min_unit_price_cents, estimated_max_unit_price_cents, checked, sort_order
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `, [
        randomUUID(), userId, enxovalId, category.id, material.name,
        material.link, material.description, material.estimatedMinUnitPriceCents,
        material.plannedQuantity, material.acquiredQuantity,
        material.estimatedMinUnitPriceCents, material.estimatedMaxUnitPriceCents,
        material.acquiredQuantity >= material.plannedQuantity, sortOrder
      ]);
    }

    return fetchWorkspace(client, userId, enxovalId);
  });
}

async function updateItemForUser(userId: string, itemId: string, body: unknown) {
  if (!body || typeof body !== 'object') {
    throw new HttpError(400, 'Dados inválidos.');
  }

  const itemScope = await getPool().query<{ enxoval_id: string; planned_quantity: number; acquired_quantity: number }>(`
    SELECT i.enxoval_id, i.planned_quantity, i.acquired_quantity
    FROM items i
    INNER JOIN enxoval_members em ON em.enxoval_id = i.enxoval_id
    WHERE i.id = $1 AND em.user_id = $2
    LIMIT 1
  `, [itemId, userId]);

  if (!itemScope.rows[0]) throw new HttpError(404, 'Item não encontrado.');

  const enxovalId = itemScope.rows[0].enxoval_id;
  const currentPlannedQuantity = Number(itemScope.rows[0].planned_quantity);
  const currentAcquiredQuantity = Number(itemScope.rows[0].acquired_quantity);
  const updates = body as Record<string, unknown>;
  const setClauses: string[] = [];
  const values: unknown[] = [];

  const addUpdate = (column: string, value: unknown) => {
    values.push(value);
    setClauses.push(`${column} = $${values.length}`);
  };

  if (typeof updates.name === 'string') {
    const name = updates.name.trim();
    if (!name) throw new HttpError(400, 'Nome do item é obrigatório.');
    addUpdate('name', name);
  }
  if (typeof updates.link === 'string') addUpdate('link', updates.link.trim());
  if (typeof updates.description === 'string') addUpdate('description', updates.description.trim());

  if (Object.prototype.hasOwnProperty.call(updates, 'priceCents')) {
    if (updates.priceCents === null) {
      addUpdate('price_cents', null);
    } else if (typeof updates.priceCents === 'number' && Number.isInteger(updates.priceCents) && updates.priceCents >= 0) {
      addUpdate('price_cents', updates.priceCents);
    } else {
      throw new HttpError(400, 'Preço inválido.');
    }
  }

  const plannedQuantity = Object.prototype.hasOwnProperty.call(updates, 'plannedQuantity')
    ? updates.plannedQuantity
    : currentPlannedQuantity;
  if (!Number.isInteger(plannedQuantity) || (plannedQuantity as number) < 1) {
    throw new HttpError(400, 'A quantidade necessária deve ser pelo menos 1.');
  }

  let acquiredQuantity = Object.prototype.hasOwnProperty.call(updates, 'acquiredQuantity')
    ? updates.acquiredQuantity
    : currentAcquiredQuantity;
  if (typeof updates.checked === 'boolean') acquiredQuantity = updates.checked ? plannedQuantity : 0;
  if (!Number.isInteger(acquiredQuantity) || (acquiredQuantity as number) < 0 || (acquiredQuantity as number) > (plannedQuantity as number)) {
    throw new HttpError(400, 'A quantidade adquirida precisa estar entre 0 e a quantidade necessária.');
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'plannedQuantity')) addUpdate('planned_quantity', plannedQuantity);
  if (Object.prototype.hasOwnProperty.call(updates, 'acquiredQuantity') || typeof updates.checked === 'boolean') addUpdate('acquired_quantity', acquiredQuantity);

  const hasEstimatedMin = Object.prototype.hasOwnProperty.call(updates, 'estimatedMinUnitPriceCents');
  const hasEstimatedMax = Object.prototype.hasOwnProperty.call(updates, 'estimatedMaxUnitPriceCents');
  if (hasEstimatedMin || hasEstimatedMax) {
    const min = hasEstimatedMin ? updates.estimatedMinUnitPriceCents : undefined;
    const max = hasEstimatedMax ? updates.estimatedMaxUnitPriceCents : undefined;
    if ((min !== null && min !== undefined && (!Number.isInteger(min) || (min as number) < 0))
      || (max !== null && max !== undefined && (!Number.isInteger(max) || (max as number) < 0))) {
      throw new HttpError(400, 'Valor estimado inválido.');
    }
    if (typeof min === 'number' && typeof max === 'number' && min > max) {
      throw new HttpError(400, 'O valor mínimo não pode ser maior que o máximo.');
    }
    if (hasEstimatedMin) {
      addUpdate('estimated_min_unit_price_cents', min ?? null);
      addUpdate('price_cents', min ?? null);
    }
    if (hasEstimatedMax) addUpdate('estimated_max_unit_price_cents', max ?? null);
  }

  if (typeof updates.categoryId === 'string') {
    const category = await findCategory(getPool(), userId, enxovalId, updates.categoryId);
    if (!category) throw new HttpError(404, 'Categoria não encontrada.');
    addUpdate('category_id', updates.categoryId);
  }

  if (setClauses.length === 0) {
    throw new HttpError(400, 'Nenhuma alteração enviada.');
  }

  values.push(itemId, enxovalId);
  const result = await getPool().query<ItemRow>(`
    UPDATE items
    SET ${setClauses.join(', ')}, checked = acquired_quantity >= planned_quantity, updated_at = now()
    WHERE id = $${values.length - 1} AND enxoval_id = $${values.length}
    RETURNING
      id,
      name,
      category_id,
      (SELECT name FROM categories WHERE categories.id = items.category_id) AS category,
      checked,
      link,
      description,
      price_cents,
      planned_quantity,
      acquired_quantity,
      estimated_min_unit_price_cents,
      estimated_max_unit_price_cents,
      sort_order,
      updated_at
  `, values);

  if (!result.rows[0]) throw new HttpError(404, 'Item não encontrado.');
  return mapItem(result.rows[0]);
}
async function deleteItemForUser(userId: string, itemId: string) {
  const result = await getPool().query<{ id: string }>(`
    DELETE FROM items i
    WHERE i.id = $1
      AND EXISTS (
        SELECT 1
        FROM enxoval_members em
        WHERE em.enxoval_id = i.enxoval_id
          AND em.user_id = $2
      )
    RETURNING id
  `, [itemId, userId]);

  if (!result.rows[0]) throw new HttpError(404, 'Item não encontrado.');
}

async function reorderCategoriesForUser(userId: string, enxovalId: string, categoryIds: string[]) {
  return withTransaction(async client => {
    await requireEnxovalMember(client, userId, enxovalId);

    const uniqueCategoryIds = new Set(categoryIds);
    if (uniqueCategoryIds.size !== categoryIds.length) {
      throw new HttpError(400, 'Categorias duplicadas na ordenação.');
    }

    const existingResult = await client.query<{ id: string }>(`
      SELECT id
      FROM categories
      WHERE enxoval_id = $1
      ORDER BY sort_order ASC, name ASC
    `, [enxovalId]);

    const existingIds = new Set(existingResult.rows.map(category => category.id));
    const invalidCategoryId = categoryIds.find(categoryId => !existingIds.has(categoryId));
    if (invalidCategoryId) {
      throw new HttpError(400, 'A ordenação contém uma categoria inválida.');
    }

    const nextCategoryIds = [
      ...categoryIds,
      ...existingResult.rows
        .map(category => category.id)
        .filter(categoryId => !uniqueCategoryIds.has(categoryId))
    ];

    for (const [sortOrder, categoryId] of nextCategoryIds.entries()) {
      await client.query(`
        UPDATE categories
        SET sort_order = $1, updated_at = now()
        WHERE id = $2 AND enxoval_id = $3
      `, [sortOrder, categoryId, enxovalId]);
    }

    return fetchCategories(client, userId, enxovalId);
  });
}

export function registerApiRoutes(app: Express) {
  const router = express.Router();

  router.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  router.get('/bootstrap', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);
    const requestedEnxovalId = typeof req.query.enxovalId === 'string' ? req.query.enxovalId : undefined;
    res.json(await fetchBootstrap(user, requestedEnxovalId));
  }));

  router.post('/auth/register', asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const password = requireText(req.body?.password, 'Senha');
    const name = typeof req.body?.name === 'string' && req.body.name.trim()
      ? req.body.name.trim()
      : email.split('@')[0];

    if (!email || !email.includes('@')) throw new HttpError(400, 'E-mail inválido.');
    if (password.length < 6) throw new HttpError(400, 'A senha precisa ter pelo menos 6 caracteres.');

    const passwordHash = await hashPassword(password);
    const userId = randomUUID();

    try {
      await withTransaction(async client => {
        await client.query(`
          INSERT INTO users (id, name, email, password_hash)
          VALUES ($1, $2, $3, $4)
        `, [userId, name, email, passwordHash]);
      });
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw new HttpError(409, 'Já existe uma conta com esse e-mail.');
      }
      throw err;
    }

    await createSession(res, userId);
    res.status(201).json(await fetchBootstrap({ id: userId, name, email }));
  }));

  router.post('/auth/login', asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const password = requireText(req.body?.password, 'Senha');

    const result = await getPool().query<DbUserRow>(`
      SELECT id, name, email, password_hash
      FROM users
      WHERE email = $1
      LIMIT 1
    `, [email]);

    const user = result.rows[0];
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      throw new HttpError(401, 'E-mail ou senha inválidos.');
    }

    await getPool().query('DELETE FROM sessions WHERE user_id = $1 AND expires_at <= now()', [user.id]);
    await createSession(res, user.id);
    res.json(await fetchBootstrap(mapUser(user)));
  }));

  router.post('/auth/logout', asyncHandler(async (req, res) => {
    const token = getCookie(req, SESSION_COOKIE);
    if (token) {
      await getPool().query('DELETE FROM sessions WHERE token_hash = $1', [hashSessionToken(token)]);
    }

    res.clearCookie(SESSION_COOKIE, cookieOptions());
    res.status(204).end();
  }));

  router.get('/enxovais/:id', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);
    res.json(await fetchWorkspace(getPool(), user.id, req.params.id));
  }));

  router.post('/enxovais', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);
    const name = requireText(req.body?.name, 'Nome da matéria');
    const useDefaultTemplate = req.body?.useDefaultTemplate === true;

    const workspace = await createEnxovalForUser(user.id, name, { useDefaultTemplate });
    res.status(201).json(workspace);
  }));
  router.patch('/enxovais/:id', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);
    const role = await requireEnxovalMember(getPool(), user.id, req.params.id);

    if (!req.body || typeof req.body !== 'object') {
      throw new HttpError(400, 'Dados inválidos.');
    }

    const updates = req.body as Record<string, unknown>;
    const setClauses: string[] = [];
    const values: unknown[] = [];

    const addUpdate = (column: string, value: unknown) => {
      values.push(value);
      setClauses.push(`${column} = $${values.length}`);
    };

    if (Object.prototype.hasOwnProperty.call(updates, 'name')) {
      if (role !== 'owner') throw new HttpError(403, 'Apenas o dono pode alterar esta lista.');
      addUpdate('name', requireText(updates.name, 'Nome da matéria'));
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'budgetCents')) {
      if (role !== 'owner') throw new HttpError(403, 'Apenas o dono pode alterar o limite da matéria.');
      if (typeof updates.budgetCents !== 'number' || !Number.isInteger(updates.budgetCents) || updates.budgetCents < 0) {
        throw new HttpError(400, 'Limite de orçamento inválido.');
      }
      addUpdate('budget_cents', updates.budgetCents);
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'discountCents')) {
      if (typeof updates.discountCents !== 'number' || !Number.isInteger(updates.discountCents) || updates.discountCents < 0) {
        throw new HttpError(400, 'Desconto inválido.');
      }
      addUpdate('discount_cents', updates.discountCents);
    }

    if (setClauses.length === 0) throw new HttpError(400, 'Nenhuma alteração enviada.');

    values.push(req.params.id);
    const result = await getPool().query<EnxovalRow>(`
      UPDATE enxovais
      SET ${setClauses.join(', ')}, updated_at = now()
      WHERE id = $${values.length}
      RETURNING id, name, owner_id, discount_cents, budget_cents, $${values.length + 1}::text AS role
    `, [...values, role]);

    if (!result.rows[0]) throw new HttpError(404, 'Lista não encontrada.');
    res.json(mapEnxoval(result.rows[0]));
  }));

  router.delete('/enxovais/:id', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);

    await requireEnxovalOwner(getPool(), user.id, req.params.id);
    await getPool().query('DELETE FROM enxovais WHERE id = $1', [req.params.id]);

    res.status(204).end();
  }));

  router.post('/imports/excel', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);
    res.status(201).json(await importExcelForUser(user.id, req.body));
  }));

  router.post('/enxovais/:id/members', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);
    const email = normalizeEmail(req.body?.email);

    if (!email || !email.includes('@')) throw new HttpError(400, 'E-mail inválido.');
    await requireEnxovalMember(getPool(), user.id, req.params.id);

    const invitedUserResult = await getPool().query<DbUserRow>(`
      SELECT id, name, email, password_hash
      FROM users
      WHERE email = $1
      LIMIT 1
    `, [email]);

    const invitedUser = invitedUserResult.rows[0];
    if (!invitedUser) throw new HttpError(404, 'Esse e-mail ainda não tem conta.');

    await getPool().query(`
      INSERT INTO enxoval_members (enxoval_id, user_id, role, invited_by)
      VALUES ($1, $2, 'editor', $3)
      ON CONFLICT (enxoval_id, user_id) DO NOTHING
    `, [req.params.id, invitedUser.id, user.id]);

    const memberResult = await getPool().query<MemberRow>(`
      SELECT u.id, u.name, u.email, em.role
      FROM enxoval_members em
      INNER JOIN users u ON u.id = em.user_id
      WHERE em.enxoval_id = $1 AND em.user_id = $2
      LIMIT 1
    `, [req.params.id, invitedUser.id]);

    res.status(201).json(mapMember(memberResult.rows[0]));
  }));

  router.get('/categories', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);
    const enxovalId = requireText(req.query.enxovalId, 'Lista');
    res.json(await fetchCategories(getPool(), user.id, enxovalId));
  }));

  router.post('/categories', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);
    const name = requireText(req.body?.name, 'Nome da categoria');
    const enxovalId = requireText(req.body?.enxovalId, 'Lista');

    const category = await withTransaction(client => findOrCreateCategory(client, user.id, enxovalId, name));
    res.status(201).json(category);
  }));

  router.patch('/categories/order', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);
    const enxovalId = requireText(req.body?.enxovalId, 'Lista');
    const categoryIds = Array.isArray(req.body?.categoryIds) && req.body.categoryIds.every((categoryId: unknown) => typeof categoryId === 'string')
      ? req.body.categoryIds
      : null;

    if (!categoryIds) throw new HttpError(400, 'Ordenação inválida.');

    res.json(await reorderCategoriesForUser(user.id, enxovalId, categoryIds));
  }));

  router.get('/items', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);
    const enxovalId = requireText(req.query.enxovalId, 'Lista');
    res.json(await fetchItems(getPool(), user.id, enxovalId));
  }));

  router.post('/items', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);
    const name = requireText(req.body?.name, 'Nome do item');
    const enxovalId = requireText(req.body?.enxovalId, 'Lista');
    const categoryId = typeof req.body?.categoryId === 'string' ? req.body.categoryId : undefined;
    const categoryName = typeof req.body?.categoryName === 'string' && req.body.categoryName.trim()
      ? req.body.categoryName.trim()
      : undefined;
    const plannedQuantity = typeof req.body?.plannedQuantity === 'number' ? req.body.plannedQuantity : 1;
    const estimatedMinUnitPriceCents = req.body?.estimatedMinUnitPriceCents ?? null;
    const estimatedMaxUnitPriceCents = req.body?.estimatedMaxUnitPriceCents ?? estimatedMinUnitPriceCents;
    if (!Number.isInteger(plannedQuantity) || plannedQuantity < 1) throw new HttpError(400, 'A quantidade necessária deve ser pelo menos 1.');
    if ((estimatedMinUnitPriceCents !== null && (!Number.isInteger(estimatedMinUnitPriceCents) || estimatedMinUnitPriceCents < 0))
      || (estimatedMaxUnitPriceCents !== null && (!Number.isInteger(estimatedMaxUnitPriceCents) || estimatedMaxUnitPriceCents < 0))
      || (typeof estimatedMinUnitPriceCents === 'number' && typeof estimatedMaxUnitPriceCents === 'number' && estimatedMinUnitPriceCents > estimatedMaxUnitPriceCents)) {
      throw new HttpError(400, 'Valores estimados inválidos.');
    }

    const result = await createItemForUser({
      userId: user.id,
      enxovalId,
      name,
      categoryId,
      categoryName,
      link: typeof req.body?.link === 'string' ? req.body.link.trim() : '',
      description: typeof req.body?.description === 'string' ? req.body.description.trim() : '',
      plannedQuantity,
      estimatedMinUnitPriceCents,
      estimatedMaxUnitPriceCents
    });
    res.status(201).json(result);
  }));

  router.patch('/items/:id', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);
    const item = await updateItemForUser(user.id, req.params.id, req.body);
    res.json(item);
  }));

  router.delete('/items/:id', asyncHandler(async (req, res) => {
    const user = await requireCurrentUser(req);
    await deleteItemForUser(user.id, req.params.id);
    res.status(204).end();
  }));

  app.use('/api', router);

  app.use('/api', (err: unknown, _req: Request, res: Response, _next: express.NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }

    console.error(err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  });
}
