export type Category = string;
export type EnxovalRole = 'owner' | 'editor';

export interface EnxovalSummary {
  id: string;
  name: string;
  ownerId: string;
  role: EnxovalRole;
  discountCents: number;
  budgetCents: number;
}

export interface EnxovalMember {
  id: string;
  name: string;
  email: string;
  role: EnxovalRole;
}

export interface EnxovalCategory {
  id: string;
  name: string;
  sortOrder: number;
}

export interface EnxovalItem {
  id: string;
  name: string;
  categoryId: string;
  category: Category;
  checked: boolean;
  link: string;
  description: string;
  priceCents: number | null;
  plannedQuantity: number;
  acquiredQuantity: number;
  estimatedMinUnitPriceCents: number | null;
  estimatedMaxUnitPriceCents: number | null;
  sortOrder: number;
  updatedAt: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

export interface EnxovalWorkspace {
  enxoval: EnxovalSummary;
  members: EnxovalMember[];
  categories: EnxovalCategory[];
  items: EnxovalItem[];
}

export interface BootstrapData {
  user: AuthUser;
  enxovais: EnxovalSummary[];
  activeEnxoval: EnxovalSummary | null;
  members: EnxovalMember[];
  categories: EnxovalCategory[];
  items: EnxovalItem[];
}
