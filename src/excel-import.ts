export type ExcelCell = unknown;

export interface ImportedMaterial {
  name: string;
  categoryName: string;
  plannedQuantity: number;
  acquiredQuantity: number;
  estimatedMinUnitPriceCents: number | null;
  estimatedMaxUnitPriceCents: number | null;
  link: string;
  description: string;
}

type MaterialField = keyof Omit<ImportedMaterial, 'categoryName'> | 'categoryName' | 'estimatedLinePriceCents';

const HEADER_ALIASES: Record<MaterialField, string[]> = {
  name: ['material', 'materiais', 'item', 'itens', 'produto', 'produtos', 'nome', 'nome do material', 'descricao do material', 'descricao do item'],
  categoryName: ['tipo', 'tipo de material', 'categoria', 'grupo'],
  plannedQuantity: ['quantidade', 'quantidade necessaria', 'qtd', 'qtde', 'qte'],
  acquiredQuantity: ['quantidade adquirida', 'quantidade comprada', 'adquirida', 'adquirido', 'comprada', 'comprado'],
  estimatedMinUnitPriceCents: ['valor minimo', 'preco minimo', 'valor unitario', 'preco unitario', 'valor estimado', 'preco', 'valor'],
  estimatedMaxUnitPriceCents: ['valor maximo', 'preco maximo'],
  estimatedLinePriceCents: ['valor aproximado', 'preco aproximado', 'valor total', 'preco total', 'total estimado'],
  link: ['link', 'url', 'site'],
  description: ['observacao', 'observacoes', 'descricao', 'detalhes']
};

function normalizeText(value: ExcelCell) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function asText(value: ExcelCell) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? '').trim();
}

function cleanMaterialName(value: ExcelCell) {
  return asText(value).replace(/\s*\[cite:\s*[^\]]+\]/gi, '').trim();
}

function positiveInteger(value: ExcelCell, fallback: number) {
  const parsed = typeof value === 'number'
    ? value
    : Number(asText(value).replace(/[^\d,.-]/g, '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : fallback;
}

function moneyToCents(value: ExcelCell) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null;

  let text = asText(value).replace(/\s/g, '').replace(/R\$/gi, '').replace(/[^\d,.-]/g, '');
  if (!text) return null;

  if (text.includes(',')) {
    text = text.replace(/\./g, '').replace(',', '.');
  } else {
    const dots = text.match(/\./g)?.length ?? 0;
    if (dots > 1 || (dots === 1 && /\.\d{3}$/.test(text))) text = text.replace(/\./g, '');
  }

  const parsed = Number(text);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : null;
}

function identifyHeader(value: ExcelCell): MaterialField | null {
  const normalized = normalizeText(value);
  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [MaterialField, string[]][]) {
    if (aliases.includes(normalized)) return field;
  }
  return null;
}

export function parseMaterialRows(rows: ExcelCell[][]): ImportedMaterial[] {
  let headerRowIndex = -1;
  let columnMap = new Map<MaterialField, number>();

  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 20); rowIndex += 1) {
    const candidate = new Map<MaterialField, number>();
    rows[rowIndex]?.forEach((cell, columnIndex) => {
      const field = identifyHeader(cell);
      if (field && !candidate.has(field)) candidate.set(field, columnIndex);
    });
    if (candidate.has('name') && candidate.size > columnMap.size) {
      headerRowIndex = rowIndex;
      columnMap = candidate;
    }
  }

  if (headerRowIndex < 0) {
    throw new Error('Não encontrei a coluna “Material”. Use esse título na primeira linha da tabela.');
  }

  const valueAt = (row: ExcelCell[], field: MaterialField) => {
    const index = columnMap.get(field);
    return index === undefined ? null : row[index];
  };

  return rows.slice(headerRowIndex + 1).flatMap(row => {
    const name = cleanMaterialName(valueAt(row, 'name'));
    if (!name) return [];
    if (/^(estimativa\s+)?total$/i.test(normalizeText(name))) return [];

    const plannedQuantity = Math.max(1, positiveInteger(valueAt(row, 'plannedQuantity'), 1));
    const acquiredQuantity = Math.min(plannedQuantity, positiveInteger(valueAt(row, 'acquiredQuantity'), 0));
    const linePrice = moneyToCents(valueAt(row, 'estimatedLinePriceCents'));
    const min = linePrice === null
      ? moneyToCents(valueAt(row, 'estimatedMinUnitPriceCents'))
      : Math.round(linePrice / plannedQuantity);
    const parsedMax = moneyToCents(valueAt(row, 'estimatedMaxUnitPriceCents'));
    const max = parsedMax ?? min;
    const rawLink = asText(valueAt(row, 'link'));
    const link = /^https?:\/\//i.test(rawLink)
      ? rawLink
      : normalizeText(rawLink) === 'pesquisar online'
        ? `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(name)}`
        : '';

    if (min !== null && max !== null && min > max) {
      throw new Error(`O valor mínimo de “${name}” é maior que o valor máximo.`);
    }

    return [{
      name,
      categoryName: asText(valueAt(row, 'categoryName')) || 'Sem tipo',
      plannedQuantity,
      acquiredQuantity,
      estimatedMinUnitPriceCents: min,
      estimatedMaxUnitPriceCents: max,
      link,
      description: asText(valueAt(row, 'description'))
    }];
  });
}

export function subjectNameFromFile(fileName: string) {
  const withoutExtension = fileName.replace(/\.xlsx$/i, '').trim();
  return withoutExtension.replace(/^lista(?:\s+de)?\s+material(?:\s+de)?\s*/i, '').trim() || withoutExtension || 'Nova matéria';
}
