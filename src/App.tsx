import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Reorder } from 'motion/react';
import { Plus, Sparkles, LogOut, User, Users, UserPlus, ListPlus, X, Pencil, Trash2, RefreshCw, Search, GripVertical, ExternalLink, Percent, Minus, SlidersHorizontal } from 'lucide-react';
import type { AuthUser, BootstrapData, EnxovalCategory, EnxovalItem, EnxovalMember, EnxovalSummary, EnxovalWorkspace } from './types';
import { ApiError, createCategory as createCategoryRequest, createEnxoval as createEnxovalRequest, createItem as createItemRequest, deleteEnxoval as deleteEnxovalRequest, deleteItem as deleteItemRequest, fetchBootstrap, fetchEnxoval as fetchEnxovalRequest, inviteMember as inviteMemberRequest, login as loginRequest, logout as logoutRequest, register as registerRequest, reorderCategories as reorderCategoriesRequest, updateEnxoval as updateEnxovalRequest, updateItem as updateItemRequest } from './api';
import { ItemRow } from './components/ItemRow';
import { AddItemModal } from './components/AddItemModal';

type AuthMode = 'login' | 'register';
type DiscountOperation = 'add' | 'subtract';
type ItemSortMode = 'name' | 'updated';
type CategorySwipeDirection = 'next' | 'previous';

const APP_NAME = 'Lista de Material';

function Tooth({ size = 24, ...props }: React.SVGProps<SVGSVGElement> & { size?: number | string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M32 9c-10.1 0-18 7.3-18 17.1 0 6.6 3.3 10.4 5.2 14.4 1.3 2.8 1.8 8.5 5.7 8.5 3.5 0 3.5-7.7 7.1-7.7s3.6 7.7 7.1 7.7c3.9 0 4.4-5.7 5.7-8.5C46.7 36.5 50 32.7 50 26.1 50 16.3 42.1 9 32 9Zm-9.2 18.5a3.1 3.1 0 1 1 0-6.2 3.1 3.1 0 0 1 0 6.2Zm18.4 0a3.1 3.1 0 1 1 0-6.2 3.1 3.1 0 0 1 0 6.2Z" />
    </svg>
  );
}

function makeTitle(context?: string) {
  return context ? `${context} | ${APP_NAME}` : APP_NAME;
}

function normalizeSearchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  hour: '2-digit',
  minute: '2-digit'
});

function normalizePriceCents(priceCents: number | string | null | undefined) {
  if (typeof priceCents === 'number' && Number.isFinite(priceCents)) return Math.round(priceCents);
  if (typeof priceCents === 'string' && priceCents.trim()) {
    const parsed = Number(priceCents);
    return Number.isFinite(parsed) ? Math.round(parsed) : null;
  }
  return null;
}

function formatCurrency(priceCents: number | string | null | undefined) {
  const normalizedPriceCents = normalizePriceCents(priceCents);
  return normalizedPriceCents !== null ? currencyFormatter.format(normalizedPriceCents / 100) : currencyFormatter.format(0);
}

function formatOptionalCurrency(priceCents: number | string | null | undefined) {
  const normalizedPriceCents = normalizePriceCents(priceCents);
  return normalizedPriceCents !== null && normalizedPriceCents > 0 ? currencyFormatter.format(normalizedPriceCents / 100) : '';
}

function priceTextToCents(value: string) {
  const digits = value.replace(/\D/g, '');
  const cents = digits ? Number(digits) : 0;
  return cents > 0 ? cents : null;
}

function formatPriceInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 12);
  return digits ? currencyFormatter.format(Number(digits) / 100) : '';
}

function getUpdatedAtTime(item: Pick<EnxovalItem, 'updatedAt'>) {
  const time = new Date(item.updatedAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return dateTimeFormatter.format(date);
}

function getProductUrl(link: string) {
  const trimmedLink = link.trim();
  if (!trimmedLink) return '';
  return trimmedLink.startsWith('http') ? trimmedLink : `https://${trimmedLink}`;
}

interface AuthScreenProps {
  onAuthenticated: (data: BootstrapData, options?: { promptCreateEnxoval?: boolean }) => void;
}

function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    document.title = makeTitle(mode === 'login' ? 'Entrar' : 'Criar conta');
  }, [mode]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const isRegistering = mode === 'register';
      const data = isRegistering
        ? await registerRequest(name, email, password)
        : await loginRequest(email, password);
      onAuthenticated(data, { promptCreateEnxoval: isRegistering && data.enxovais.length === 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 px-4 py-10 font-sans text-brand-dark flex items-center justify-center">
      <div className="w-full max-w-md bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-stone-100">
          <div className="flex items-center gap-2 text-brand-wood mb-2">
            <Tooth size={20} />
            <span className="text-xs font-bold tracking-widest uppercase">Lista de Material</span>
          </div>
          <h1 className="font-serif text-3xl font-bold text-stone-900 leading-tight">
            Lista de Material
          </h1>
        </div>

        <div className="grid grid-cols-2 border-b border-stone-100">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`py-3 text-sm font-semibold transition-colors ${mode === 'login' ? 'bg-brand-dark text-white' : 'text-stone-500 hover:bg-stone-50'}`}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => setMode('register')}
            className={`py-3 text-sm font-semibold transition-colors ${mode === 'register' ? 'bg-brand-dark text-white' : 'text-stone-500 hover:bg-stone-50'}`}
          >
            Criar conta
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {mode === 'register' && (
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Nome</label>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full px-4 py-3 text-base border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-wood/50 focus:border-brand-wood"
                placeholder="Seu nome"
                autoComplete="name"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full px-4 py-3 text-base border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-wood/50 focus:border-brand-wood"
              placeholder="você@email.com"
              autoComplete="email"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Senha</label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full px-4 py-3 text-base border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-wood/50 focus:border-brand-wood"
              placeholder="Mínimo de 6 caracteres"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-4 bg-brand-dark text-white rounded-xl font-medium text-lg hover:bg-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Aguarde...' : mode === 'login' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>
      </div>
    </div>
  );
}

interface DialogProps {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

function Dialog({ title, isOpen, onClose, children }: DialogProps) {
  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-stone-900/50 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 max-h-[calc(100dvh-1rem)] w-full overflow-y-auto overscroll-y-contain bg-white rounded-t-2xl shadow-xl z-50 md:bottom-auto md:top-1/2 md:left-1/2 md:max-w-md md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl">
        <div className="flex items-center justify-between p-4 border-b border-stone-100">
          <h3 className="font-serif text-xl text-stone-800">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-stone-400 hover:text-stone-600 bg-stone-100 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [enxovais, setEnxovais] = useState<EnxovalSummary[]>([]);
  const [activeEnxoval, setActiveEnxoval] = useState<EnxovalSummary | null>(null);
  const [members, setMembers] = useState<EnxovalMember[]>([]);
  const [items, setItems] = useState<EnxovalItem[]>([]);
  const [categories, setCategories] = useState<EnxovalCategory[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [showOnlyPricedItems, setShowOnlyPricedItems] = useState(false);
  const [showOnlyCheckedItems, setShowOnlyCheckedItems] = useState(false);
  const [itemSortMode, setItemSortMode] = useState<ItemSortMode>('name');
  const [categorySwipeOffset, setCategorySwipeOffset] = useState(0);
  const [categorySwipeDirection, setCategorySwipeDirection] = useState<CategorySwipeDirection | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isCreateCategoryOpen, setIsCreateCategoryOpen] = useState(false);
  const [isReorderCategoriesOpen, setIsReorderCategoriesOpen] = useState(false);
  const [isCreateEnxovalOpen, setIsCreateEnxovalOpen] = useState(false);
  const [isRenameEnxovalOpen, setIsRenameEnxovalOpen] = useState(false);
  const [isDeleteEnxovalOpen, setIsDeleteEnxovalOpen] = useState(false);
  const [isDiscountsOpen, setIsDiscountsOpen] = useState(false);
  const [discountOperation, setDiscountOperation] = useState<DiscountOperation>('add');
  const [discountAdjustmentText, setDiscountAdjustmentText] = useState('');
  const [discountWorkingCents, setDiscountWorkingCents] = useState(0);
  const [itemToDelete, setItemToDelete] = useState<EnxovalItem | null>(null);
  const [itemToEdit, setItemToEdit] = useState<EnxovalItem | null>(null);
  const [editItemName, setEditItemName] = useState('');
  const [editItemLink, setEditItemLink] = useState('');
  const [editItemDescription, setEditItemDescription] = useState('');
  const [editItemPriceText, setEditItemPriceText] = useState('');
  const [editItemCategoryId, setEditItemCategoryId] = useState('');
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [newEnxovalName, setNewEnxovalName] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categoryOrder, setCategoryOrder] = useState<EnxovalCategory[]>([]);
  const [newEnxovalUseDefaultTemplate, setNewEnxovalUseDefaultTemplate] = useState(true);
  const [renameEnxovalName, setRenameEnxovalName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [dialogError, setDialogError] = useState('');
  const [isDialogSubmitting, setIsDialogSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [headerProgress, setHeaderProgress] = useState(0);
  const [isHeaderMobile, setIsHeaderMobile] = useState(false);
  const [error, setError] = useState('');
  const pullStartYRef = useRef<number | null>(null);
  const pullLastDistanceRef = useRef(0);
  const discountAdjustmentInputRef = useRef<HTMLInputElement | null>(null);
  const categorySwipeRef = useRef<{ pointerId: number; startX: number; startY: number; isSwiping: boolean; isCanceled: boolean } | null>(null);
  const categorySwipeAnimationTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (categorySwipeAnimationTimerRef.current !== null) {
      window.clearTimeout(categorySwipeAnimationTimerRef.current);
    }
  }, []);
  const applyWorkspace = (workspace: EnxovalWorkspace) => {
    setActiveEnxoval(workspace.enxoval);
    setMembers(workspace.members);
    setCategories(workspace.categories);
    setItems(workspace.items);
    setActiveCategoryId(workspace.categories[0]?.id || '');
  };

  const applyBootstrap = (data: BootstrapData, options?: { promptCreateEnxoval?: boolean }) => {
    setUser(data.user);
    setEnxovais(data.enxovais);
    setActiveEnxoval(data.activeEnxoval);
    setMembers(data.members);
    setCategories(data.categories);
    setItems(data.items);
    setActiveCategoryId(data.categories[0]?.id || '');

    if (options?.promptCreateEnxoval) {
      setDialogError('');
      setNewEnxovalName('');
      setNewEnxovalUseDefaultTemplate(true);
      setIsCreateEnxovalOpen(true);
    }
  };

  useEffect(() => {
    let isMounted = true;

    fetchBootstrap()
      .then(data => {
        if (isMounted) applyBootstrap(data);
      })
      .catch(err => {
        if (!isMounted) return;
        if (err instanceof ApiError && err.status === 401) {
          setUser(null);
          return;
        }
        setError(err instanceof Error ? err.message : 'Não foi possível carregar seus dados.');
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (isLoading) {
      document.title = makeTitle('Carregando');
      return;
    }

    if (!user) {
      document.title = makeTitle('Entrar');
      return;
    }

    if (isCreateEnxovalOpen) {
      document.title = makeTitle('Novo enxoval');
      return;
    }

    if (isCreateCategoryOpen) {
      document.title = makeTitle('Nova categoria');
      return;
    }

    if (isReorderCategoriesOpen) {
      document.title = makeTitle('Reordenar categorias');
      return;
    }

    if (isRenameEnxovalOpen) {
      document.title = makeTitle(activeEnxoval ? 'Editar ' + activeEnxoval.name : 'Editar enxoval');
      return;
    }

    if (isDeleteEnxovalOpen) {
      document.title = makeTitle(activeEnxoval ? 'Excluir ' + activeEnxoval.name : 'Excluir enxoval');
      return;
    }

    if (isDiscountsOpen) {
      document.title = makeTitle('Descontos e cashback');
      return;
    }

    if (itemToDelete) {
      document.title = makeTitle('Excluir ' + itemToDelete.name);
      return;
    }

    if (itemToEdit) {
      document.title = makeTitle('Editar ' + itemToEdit.name);
      return;
    }

    if (isInviteOpen) {
      document.title = makeTitle(activeEnxoval ? 'Convidar para ' + activeEnxoval.name : 'Convidar pessoa');
      return;
    }

    if (activeEnxoval) {
      document.title = makeTitle(isWorkspaceLoading ? 'Carregando ' + activeEnxoval.name : activeEnxoval.name);
      return;
    }

    document.title = makeTitle('Meus enxovais');
  }, [activeEnxoval, isCreateCategoryOpen, isCreateEnxovalOpen, isDeleteEnxovalOpen, isDiscountsOpen, isInviteOpen, isLoading, isRenameEnxovalOpen, isReorderCategoriesOpen, isWorkspaceLoading, itemToDelete, itemToEdit, user]);

  useEffect(() => {
    let animationFrame = 0;

    const updateHeaderSize = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        const isMobile = window.innerWidth < 640;
        setIsHeaderMobile(isMobile);
        setHeaderProgress(isMobile ? Math.min(Math.max(window.scrollY / 140, 0), 1) : 0);
      });
    };

    updateHeaderSize();
    window.addEventListener('scroll', updateHeaderSize, { passive: true });
    window.addEventListener('resize', updateHeaderSize);

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener('scroll', updateHeaderSize);
      window.removeEventListener('resize', updateHeaderSize);
    };
  }, []);

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;

    setIsRefreshing(true);
    setError('');

    try {
      const currentCategoryId = activeCategoryId;
      const data = await fetchBootstrap(activeEnxoval?.id);
      applyBootstrap(data);

      if (currentCategoryId && data.categories.some(category => category.id === currentCategoryId)) {
        setActiveCategoryId(currentCategoryId);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
        return;
      }
      setError(err instanceof Error ? err.message : 'Não foi possível atualizar o enxoval.');
    } finally {
      setIsRefreshing(false);
    }
  }, [activeCategoryId, activeEnxoval?.id, isRefreshing]);

  useEffect(() => {
    if (!user || !isHeaderMobile || isReorderCategoriesOpen) {
      pullStartYRef.current = null;
      pullLastDistanceRef.current = 0;
      setPullDistance(0);
      return;
    }

    const pullThreshold = 72;
    let resetTimer: number | undefined;

    const isInteractiveTarget = (target: EventTarget | null) => (
      target instanceof HTMLElement && Boolean(target.closest('button, input, textarea, select, a, [role="button"]'))
    );

    const resetPull = () => {
      pullStartYRef.current = null;
      pullLastDistanceRef.current = 0;
      setPullDistance(0);
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (isRefreshing || window.scrollY > 0 || event.touches.length !== 1 || isInteractiveTarget(event.target)) {
        resetPull();
        return;
      }

      pullStartYRef.current = event.touches[0].clientY;
      pullLastDistanceRef.current = 0;
    };

    const handleTouchMove = (event: TouchEvent) => {
      const startY = pullStartYRef.current;
      if (startY === null || event.touches.length !== 1) return;

      const delta = event.touches[0].clientY - startY;
      if (delta <= 0 || window.scrollY > 0) {
        resetPull();
        return;
      }

      const distance = Math.min(Math.round(delta * 0.55), 96);
      pullLastDistanceRef.current = distance;
      setPullDistance(distance);

      if (distance > 4 && event.cancelable) {
        event.preventDefault();
      }
    };

    const handleTouchEnd = () => {
      if (pullStartYRef.current === null) return;

      const shouldRefresh = pullLastDistanceRef.current >= pullThreshold;
      pullStartYRef.current = null;
      pullLastDistanceRef.current = 0;

      if (!shouldRefresh) {
        setPullDistance(0);
        return;
      }

      setPullDistance(pullThreshold);
      void handleRefresh().finally(() => {
        resetTimer = window.setTimeout(() => setPullDistance(0), 180);
      });
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('touchcancel', resetPull);

    return () => {
      if (resetTimer) window.clearTimeout(resetTimer);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', resetPull);
    };
  }, [handleRefresh, isHeaderMobile, isRefreshing, isReorderCategoriesOpen, user]);

  const activeCategory = categories.find(category => category.id === activeCategoryId) ?? categories[0];
  const normalizedSearchQuery = normalizeSearchText(searchQuery);
  const isSearching = normalizedSearchQuery.length > 0;
  const isShowingLatestChanges = itemSortMode === 'updated';
  const hasItemFilters = showOnlyPricedItems || showOnlyCheckedItems;
  const activeFilterCount = (showOnlyPricedItems ? 1 : 0) + (showOnlyCheckedItems ? 1 : 0) + (itemSortMode !== 'name' ? 1 : 0);
  const categoryById = useMemo(() => new Map(categories.map(category => [category.id, category])), [categories]);
  const filteredItems = useMemo(() => {
    const baseItems = isSearching || isShowingLatestChanges
      ? items
      : activeCategory
        ? items.filter(item => item.categoryId === activeCategory.id)
        : [];

    const searchedItems = isSearching
      ? baseItems.filter(item => {
        const categoryName = categoryById.get(item.categoryId)?.name ?? item.category;
        const searchableText = normalizeSearchText([
          item.name,
          item.description,
          item.link,
          item.priceCents === null ? '' : String(item.priceCents / 100),
          categoryName
        ].join(' '));

        return searchableText.includes(normalizedSearchQuery);
      })
      : baseItems;

    const narrowedItems = searchedItems.filter(item => {
      if (showOnlyPricedItems) {
        const priceCents = normalizePriceCents(item.priceCents);
        if (priceCents === null || priceCents <= 0) return false;
      }

      if (showOnlyCheckedItems && !item.checked) return false;
      return true;
    });

    return [...narrowedItems].sort((firstItem, secondItem) => {
      if (itemSortMode === 'updated') {
        const updatedDifference = getUpdatedAtTime(secondItem) - getUpdatedAtTime(firstItem);
        if (updatedDifference !== 0) return updatedDifference;
      }

      return firstItem.name.localeCompare(secondItem.name, 'pt-BR', { sensitivity: 'base' })
        || firstItem.category.localeCompare(secondItem.category, 'pt-BR', { sensitivity: 'base' });
    });
  }, [activeCategory, categoryById, isSearching, isShowingLatestChanges, itemSortMode, items, normalizedSearchQuery, showOnlyCheckedItems, showOnlyPricedItems]);
  const filteredCheckedCount = filteredItems.filter(item => item.checked).length;
  const itemCountText = `${filteredItems.length} ${filteredItems.length === 1 ? 'item' : 'itens'}`;
  const listTitle = isSearching
    ? 'Resultados da busca'
    : isShowingLatestChanges
      ? 'Últimas alterações'
      : hasItemFilters
        ? `Itens filtrados em ${activeCategory?.name ?? 'categoria'}`
        : `Progresso de ${activeCategory?.name ?? 'categoria'}`;
  const listCounterText = !isSearching && !isShowingLatestChanges && !hasItemFilters
    ? `${filteredCheckedCount} de ${filteredItems.length} itens`
    : itemCountText;
  const showItemCategory = isSearching || isShowingLatestChanges;
  const canSwipeCategories = categories.length > 1 && !isSearching && !isShowingLatestChanges;
  const categorySwipeAnimationClass = categorySwipeDirection === 'next'
    ? 'category-list-enter-next'
    : categorySwipeDirection === 'previous'
      ? 'category-list-enter-previous'
      : '';
  const categorySwipeStyle: React.CSSProperties | undefined = categorySwipeOffset !== 0 ? {
    opacity: 1 - Math.min(Math.abs(categorySwipeOffset) / 360, 0.16),
    transform: `translateX(${categorySwipeOffset}px)`,
    transition: 'none'
  } : undefined;

  const progressStats = useMemo(() => {
    const total = items.length;
    const completed = items.filter(i => i.checked).length;
    const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);
    return { total, completed, percentage };
  }, [items]);
  const checkedSubtotalSpentCents = useMemo(() => items.reduce((total, item) => {
    if (!item.checked) return total;

    const priceCents = normalizePriceCents(item.priceCents);
    return priceCents && priceCents > 0 ? total + priceCents : total;
  }, 0), [items]);
  const enxovalDiscountCents = normalizePriceCents(activeEnxoval?.discountCents) ?? 0;
  const discountAdjustmentCents = priceTextToCents(discountAdjustmentText) ?? 0;
  const checkedTotalSpentCents = Math.max(0, checkedSubtotalSpentCents - enxovalDiscountCents);
  const discountPreviewTotalCents = Math.max(0, checkedSubtotalSpentCents - discountWorkingCents);
  const checkedSubtotalSpentText = formatCurrency(checkedSubtotalSpentCents);
  const savedDiscountText = formatCurrency(enxovalDiscountCents);
  const discountsButtonTitle = enxovalDiscountCents > 0 ? 'Descontos e cashback: - ' + savedDiscountText : 'Descontos e cashback';
  const discountAdjustmentPreviewText = formatCurrency(discountAdjustmentCents);
  const workingDiscountText = formatCurrency(discountWorkingCents);
  const checkedTotalSpentText = formatCurrency(checkedTotalSpentCents);
  const discountPreviewTotalText = formatCurrency(discountPreviewTotalCents);
  const hasEnxoval = enxovais.length > 0 && Boolean(activeEnxoval);
  const isOwner = activeEnxoval?.role === 'owner';
  const visibleProgress = isHeaderMobile ? headerProgress : 0;
  const headerStyle = isHeaderMobile ? {
    paddingTop: `${32 - (20 * visibleProgress)}px`,
    paddingBottom: `${16 - (4 * visibleProgress)}px`
  } : undefined;
  const eyebrowStyle: React.CSSProperties = {
    maxHeight: `${24 * (1 - visibleProgress)}px`,
    opacity: 1 - visibleProgress,
    transform: `translateY(${-4 * visibleProgress}px)`,
    pointerEvents: visibleProgress > 0.9 ? 'none' : 'auto'
  };
  const metaStyle: React.CSSProperties = {
    marginTop: `${12 * (1 - visibleProgress)}px`,
    maxHeight: `${24 * (1 - visibleProgress)}px`,
    opacity: 1 - visibleProgress,
    transform: `translateY(${-4 * visibleProgress}px)`,
    pointerEvents: visibleProgress > 0.9 ? 'none' : 'auto'
  };
  const controlsStyle: React.CSSProperties = {
    marginTop: `${12 * (1 - visibleProgress)}px`,
    maxHeight: `${88 * (1 - visibleProgress)}px`,
    opacity: 1 - visibleProgress,
    transform: `translateY(${-4 * visibleProgress}px)`,
    pointerEvents: visibleProgress > 0.9 ? 'none' : 'auto'
  };
  const titleStyle = isHeaderMobile ? {
    fontSize: `${30 - (10 * visibleProgress)}px`
  } : undefined;
  const progressCircleStyle = isHeaderMobile ? {
    width: `${64 - (16 * visibleProgress)}px`,
    height: `${64 - (16 * visibleProgress)}px`,
    borderWidth: `${4 - visibleProgress}px`
  } : undefined;
  const progressTextStyle = isHeaderMobile ? {
    fontSize: `${18 - (4 * visibleProgress)}px`
  } : undefined;
  const totalSpentTitleStyle: React.CSSProperties = isHeaderMobile ? {
    marginTop: `${4 * visibleProgress}px`,
    maxHeight: `${24 * visibleProgress}px`,
    opacity: visibleProgress,
    paddingTop: `${4 * visibleProgress}px`,
    paddingBottom: `${4 * visibleProgress}px`,
    transform: `translateY(${-4 * (1 - visibleProgress)}px)`,
    pointerEvents: visibleProgress > 0.45 ? 'auto' : 'none'
  } : { display: 'none' };
  const totalSpentSideStyle: React.CSSProperties | undefined = isHeaderMobile ? {
    maxHeight: `${24 * (1 - visibleProgress)}px`,
    opacity: 1 - visibleProgress,
    paddingTop: `${4 * (1 - visibleProgress)}px`,
    paddingBottom: `${4 * (1 - visibleProgress)}px`,
    transform: `translateY(${-4 * visibleProgress}px)`,
    pointerEvents: visibleProgress > 0.45 ? 'none' : 'auto'
  } : undefined;
  const headerMetricsStyle: React.CSSProperties | undefined = isHeaderMobile ? {
    gap: `${6 * (1 - visibleProgress)}px`
  } : undefined;
  const categoryBarStyle = isHeaderMobile ? {
    marginTop: `${18 - (6 * visibleProgress)}px`
  } : undefined;
  const categoryButtonStyle = isHeaderMobile ? {
    paddingTop: `${8 - (2 * visibleProgress)}px`,
    paddingBottom: `${8 - (2 * visibleProgress)}px`
  } : undefined;
  const editItemProductUrl = getProductUrl(editItemLink);

  const startCategorySwipeAnimation = useCallback((direction: CategorySwipeDirection) => {
    if (categorySwipeAnimationTimerRef.current !== null) {
      window.clearTimeout(categorySwipeAnimationTimerRef.current);
    }

    setCategorySwipeDirection(direction);
    categorySwipeAnimationTimerRef.current = window.setTimeout(() => {
      setCategorySwipeDirection(null);
      categorySwipeAnimationTimerRef.current = null;
    }, 220);
  }, []);

  const changeCategoryBySwipe = useCallback((direction: CategorySwipeDirection) => {
    if (!canSwipeCategories || !activeCategory) return false;

    const currentCategoryIndex = categories.findIndex(category => category.id === activeCategory.id);
    if (currentCategoryIndex < 0) return false;

    const nextCategoryIndex = direction === 'next' ? currentCategoryIndex + 1 : currentCategoryIndex - 1;
    const nextCategory = categories[nextCategoryIndex];
    if (!nextCategory) return false;

    startCategorySwipeAnimation(direction);
    setActiveCategoryId(nextCategory.id);
    return true;
  }, [activeCategory, canSwipeCategories, categories, startCategorySwipeAnimation]);

  const resetCategorySwipe = useCallback(() => {
    categorySwipeRef.current = null;
    setCategorySwipeOffset(0);
  }, []);

  const handleCategoryListPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!canSwipeCategories || (event.pointerType === 'mouse' && event.button !== 0)) return;

    const target = event.target;
    if (target instanceof HTMLElement && target.closest('button, input, textarea, select, a, [role="button"]')) return;

    categorySwipeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      isSwiping: false,
      isCanceled: false
    };
    setCategorySwipeOffset(0);
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [canSwipeCategories]);

  const handleCategoryListPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const swipe = categorySwipeRef.current;
    if (!swipe || swipe.pointerId !== event.pointerId || swipe.isCanceled) return;

    const deltaX = event.clientX - swipe.startX;
    const deltaY = event.clientY - swipe.startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (!swipe.isSwiping) {
      if (absY > 12 && absY > absX) {
        swipe.isCanceled = true;
        setCategorySwipeOffset(0);
        return;
      }

      if (absX < 16 || absX < absY * 1.2) return;
      swipe.isSwiping = true;
    }

    event.preventDefault();
    setCategorySwipeOffset(Math.max(-72, Math.min(72, deltaX * 0.45)));
  }, []);

  const handleCategoryListPointerEnd = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const swipe = categorySwipeRef.current;
    if (!swipe || swipe.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const deltaX = event.clientX - swipe.startX;
    const deltaY = event.clientY - swipe.startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (!swipe.isCanceled && swipe.isSwiping && absX >= 56 && absX > absY * 1.1) {
      void changeCategoryBySwipe(deltaX < 0 ? 'next' : 'previous');
    }

    resetCategorySwipe();
  }, [changeCategoryBySwipe, resetCategorySwipe]);

  const handleCategoryListPointerCancel = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    resetCategorySwipe();
  }, [resetCategorySwipe]);

  const handleEnxovalChange = async (enxovalId: string) => {
    if (!enxovalId || enxovalId === activeEnxoval?.id) return;

    setIsWorkspaceLoading(true);
    setError('');

    try {
      const workspace = await fetchEnxovalRequest(enxovalId);
      applyWorkspace(workspace);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível abrir o enxoval.');
    } finally {
      setIsWorkspaceLoading(false);
    }
  };

  const updateItem = async (id: string, updates: Partial<EnxovalItem>) => {
    const shouldOptimisticallyUpdate = Object.keys(updates).length === 1 && typeof updates.checked === 'boolean';
    const previousItem = shouldOptimisticallyUpdate ? items.find(item => item.id === id) : undefined;

    if (shouldOptimisticallyUpdate) {
      setItems(current =>
        current.map(item => item.id === id ? { ...item, ...updates } : item)
      );
    }

    const payload: Parameters<typeof updateItemRequest>[1] = {};
    if (typeof updates.name === 'string') payload.name = updates.name;
    if (typeof updates.checked === 'boolean') payload.checked = updates.checked;
    if (typeof updates.link === 'string') payload.link = updates.link;
    if (typeof updates.description === 'string') payload.description = updates.description;
    if (typeof updates.priceCents === 'number' || updates.priceCents === null) payload.priceCents = updates.priceCents;
    if (typeof updates.categoryId === 'string') payload.categoryId = updates.categoryId;

    if (Object.keys(payload).length === 0) return;

    try {
      const savedItem = await updateItemRequest(id, payload);
      setItems(current => current.map(item => item.id === id ? savedItem : item));
    } catch (err) {
      if (previousItem) {
        setItems(current => current.map(item => item.id === id ? previousItem : item));
      }
      setError(err instanceof Error ? err.message : 'Não foi possível salvar a alteração.');
      throw err;
    }
  };

  const addItem = async (name: string, categoryId?: string, categoryName?: string) => {
    if (!activeEnxoval) throw new Error('Selecione um enxoval antes de adicionar itens.');

    const result = await createItemRequest({ enxovalId: activeEnxoval.id, name, categoryId, categoryName });

    setCategories(current => {
      if (current.some(category => category.id === result.category.id)) return current;
      return [...current, result.category].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    });

    setItems(current => [...current, result.item]);
    setActiveCategoryId(result.category.id);
  };

  const openDeleteItem = (item: EnxovalItem) => {
    setDialogError('');
    setItemToDelete(item);
  };

  const openEditItem = (item: EnxovalItem) => {
    const nextCategoryId = categories.some(category => category.id === item.categoryId)
      ? item.categoryId
      : categories[0]?.id || '';

    setDialogError('');
    setItemToEdit(item);
    setEditItemName(item.name);
    setEditItemLink(item.link);
    setEditItemDescription(item.description);
    setEditItemPriceText(formatOptionalCurrency(item.priceCents));
    setEditItemCategoryId(nextCategoryId);
  };

  const closeEditItem = () => {
    setDialogError('');
    setItemToEdit(null);
    setEditItemName('');
    setEditItemLink('');
    setEditItemDescription('');
    setEditItemPriceText('');
    setEditItemCategoryId('');
  };

  const handleEditItemPriceChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setEditItemPriceText(formatPriceInput(event.target.value));
  };

  const handleSaveItemDetails = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!itemToEdit) return;

    setIsDialogSubmitting(true);
    setDialogError('');

    try {
      const nextName = editItemName.trim();
      if (!nextName) return;

      const nextLink = editItemLink.trim();
      const nextDescription = editItemDescription.trim();
      const nextPriceCents = priceTextToCents(editItemPriceText);
      const nextCategoryId = editItemCategoryId || itemToEdit.categoryId;

      await updateItem(itemToEdit.id, {
        name: nextName,
        link: nextLink,
        description: nextDescription,
        priceCents: nextPriceCents,
        categoryId: nextCategoryId
      });

      closeEditItem();
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : 'Não foi possível salvar os detalhes.');
    } finally {
      setIsDialogSubmitting(false);
    }
  };

  const handleDeleteItem = async () => {
    if (!itemToDelete) return;

    setIsDialogSubmitting(true);
    setDialogError('');

    try {
      const deletedId = itemToDelete.id;
      await deleteItemRequest(deletedId);
      setItems(current => current.filter(item => item.id !== deletedId));
      setItemToDelete(null);
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : 'Não foi possível remover o item.');
    } finally {
      setIsDialogSubmitting(false);
    }
  };

  const handleSaveCategoryOrder = async () => {
    if (!activeEnxoval) return;

    setIsDialogSubmitting(true);
    setDialogError('');

    try {
      const reorderedCategories = await reorderCategoriesRequest(activeEnxoval.id, categoryOrder.map(category => category.id));
      setCategories(reorderedCategories);
      setCategoryOrder(reorderedCategories);

      if (!reorderedCategories.some(category => category.id === activeCategoryId)) {
        setActiveCategoryId(reorderedCategories[0]?.id || '');
      }

      setIsReorderCategoriesOpen(false);
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : 'Não foi possível reordenar as categorias.');
    } finally {
      setIsDialogSubmitting(false);
    }
  };

  const handleCreateCategory = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeEnxoval) return;

    const name = newCategoryName.trim();
    if (!name) return;

    setIsDialogSubmitting(true);
    setDialogError('');

    try {
      const category = await createCategoryRequest(activeEnxoval.id, name);
      setCategories(current => {
        const alreadyExists = current.some(existing => existing.id === category.id);
        const nextCategories = alreadyExists
          ? current.map(existing => existing.id === category.id ? category : existing)
          : [...current, category];

        return nextCategories.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
      });
      setActiveCategoryId(category.id);
      setSearchQuery('');
      setNewCategoryName('');
      setIsCreateCategoryOpen(false);
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : 'Não foi possível criar a categoria.');
    } finally {
      setIsDialogSubmitting(false);
    }
  };

  const handleCreateEnxoval = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = newEnxovalName.trim();
    if (!name) return;

    setIsDialogSubmitting(true);
    setDialogError('');

    try {
      const workspace = await createEnxovalRequest(name, newEnxovalUseDefaultTemplate);
      setEnxovais(current => [...current, workspace.enxoval]);
      applyWorkspace(workspace);
      setNewEnxovalName('');
      setNewEnxovalUseDefaultTemplate(true);
      setIsCreateEnxovalOpen(false);
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : 'Não foi possível criar o enxoval.');
    } finally {
      setIsDialogSubmitting(false);
    }
  };

  const handleRenameEnxoval = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeEnxoval) return;

    const name = renameEnxovalName.trim();
    if (!name) return;

    setIsDialogSubmitting(true);
    setDialogError('');

    try {
      const updatedEnxoval = await updateEnxovalRequest(activeEnxoval.id, name);
      setActiveEnxoval(updatedEnxoval);
      setEnxovais(current => current.map(enxoval => enxoval.id === updatedEnxoval.id ? updatedEnxoval : enxoval));
      setRenameEnxovalName('');
      setIsRenameEnxovalOpen(false);
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : 'Não foi possível renomear o enxoval.');
    } finally {
      setIsDialogSubmitting(false);
    }
  };

  const handleDeleteEnxoval = async () => {
    if (!activeEnxoval) return;

    setIsDialogSubmitting(true);
    setDialogError('');

    try {
      const deletedId = activeEnxoval.id;
      await deleteEnxovalRequest(deletedId);

      const remainingEnxovais = enxovais.filter(enxoval => enxoval.id !== deletedId);
      setEnxovais(remainingEnxovais);
      setIsDeleteEnxovalOpen(false);

      const nextEnxoval = remainingEnxovais[0];
      if (nextEnxoval) {
        const workspace = await fetchEnxovalRequest(nextEnxoval.id);
        applyWorkspace(workspace);
      } else {
        setActiveEnxoval(null);
        setMembers([]);
        setCategories([]);
        setItems([]);
        setActiveCategoryId('');
      }
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : 'Não foi possível excluir o enxoval.');
    } finally {
      setIsDialogSubmitting(false);
    }
  };
  const handleInviteMember = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeEnxoval) return;

    const email = inviteEmail.trim();
    if (!email) return;

    setIsDialogSubmitting(true);
    setDialogError('');

    try {
      const member = await inviteMemberRequest(activeEnxoval.id, email);
      setMembers(current => current.some(existing => existing.id === member.id) ? current : [...current, member]);
      setInviteEmail('');
      setIsInviteOpen(false);
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : 'Não foi possível convidar essa pessoa.');
    } finally {
      setIsDialogSubmitting(false);
    }
  };

  const openCreateEnxoval = () => {
    setDialogError('');
    setNewEnxovalName('');
    setNewEnxovalUseDefaultTemplate(true);
    setIsCreateEnxovalOpen(true);
  };

  const openCreateCategory = () => {
    setDialogError('');
    setNewCategoryName('');
    setIsCreateCategoryOpen(true);
  };

  const openReorderCategories = () => {
    setDialogError('');
    setCategoryOrder(categories);
    setIsReorderCategoriesOpen(true);
  };

  const openRenameEnxoval = () => {
    if (!activeEnxoval) return;
    setDialogError('');
    setRenameEnxovalName(activeEnxoval.name);
    setIsRenameEnxovalOpen(true);
  };

  const openDiscounts = () => {
    if (!activeEnxoval) return;
    setDialogError('');
    setDiscountOperation('add');
    setDiscountAdjustmentText('');
    setDiscountWorkingCents(normalizePriceCents(activeEnxoval.discountCents) ?? 0);
    setIsDiscountsOpen(true);
  };

  const handleDiscountAdjustmentChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setDiscountAdjustmentText(formatPriceInput(event.target.value));
  };

  const handleApplyDiscountAdjustment = () => {
    if (discountAdjustmentCents <= 0) return;

    setDiscountWorkingCents(current => (
      discountOperation === 'add'
        ? current + discountAdjustmentCents
        : Math.max(0, current - discountAdjustmentCents)
      ));
    setDiscountAdjustmentText('');
    discountAdjustmentInputRef.current?.focus({ preventScroll: true });
  };

  const handleSaveDiscounts = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeEnxoval) return;

    setIsDialogSubmitting(true);
    setDialogError('');

    try {
      const updatedEnxoval = await updateEnxovalRequest(activeEnxoval.id, {
        discountCents: discountWorkingCents
      });
      setActiveEnxoval(updatedEnxoval);
      setEnxovais(current => current.map(enxoval => enxoval.id === updatedEnxoval.id ? updatedEnxoval : enxoval));
      setDiscountAdjustmentText('');
      setIsDiscountsOpen(false);
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : 'Não foi possível salvar os descontos.');
    } finally {
      setIsDialogSubmitting(false);
    }
  };

  const openDeleteEnxoval = () => {
    if (!activeEnxoval) return;
    setDialogError('');
    setIsDeleteEnxovalOpen(true);
  };

  const openInvite = () => {
    setDialogError('');
    setInviteEmail('');
    setIsInviteOpen(true);
  };

  const handleLogout = async () => {
    await logoutRequest().catch(() => undefined);
    setUser(null);
    setEnxovais([]);
    setActiveEnxoval(null);
    setIsRenameEnxovalOpen(false);
    setIsDeleteEnxovalOpen(false);
    setIsDiscountsOpen(false);
    setItemToDelete(null);
    closeEditItem();
    setMembers([]);
    setItems([]);
    setCategories([]);
    setActiveCategoryId('');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-stone-50 font-sans text-brand-dark flex items-center justify-center">
        <div className="text-center">
          <Tooth className="w-10 h-10 text-brand-wood mx-auto mb-3" />
          <p className="text-sm text-stone-500 font-medium">Carregando lista...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen onAuthenticated={applyBootstrap} />;
  }

  return (
    <div className="min-h-screen bg-stone-50 pb-24 font-sans text-brand-dark overscroll-y-contain">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed left-1/2 top-3 z-50 sm:hidden transition-opacity duration-150"
        style={{
          opacity: pullDistance > 0 || isRefreshing ? 1 : 0,
          transform: `translate(-50%, ${Math.max(0, pullDistance - 34)}px)`
        }}
      >
        <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-brand-wood shadow-md ring-1 ring-stone-200">
          <RefreshCw
            size={17}
            className={isRefreshing ? 'animate-spin' : ''}
            style={isRefreshing ? undefined : { transform: `rotate(${pullDistance * 3}deg)` }}
          />
        </div>
      </div>
      <header
        className="bg-white px-4 sm:px-6 pt-8 pb-4 sm:pt-12 sm:pb-6 shadow-sm sticky top-0 z-20 transition-[padding] duration-300 ease-out"
        style={headerStyle}
      >
        <div className="max-w-2xl mx-auto flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div
              className="flex items-center gap-2 text-brand-wood mb-1 overflow-hidden transition-[opacity,max-height,transform] duration-300 ease-out"
              style={eyebrowStyle}
            >
              <Tooth size={20} className="shrink-0" />
              <span className="text-xs font-bold leading-none tracking-widest uppercase">Lista de Material</span>
            </div>
            <h1
              className="font-serif font-bold text-stone-900 leading-tight truncate transition-[font-size] duration-300 ease-out sm:text-3xl"
              style={titleStyle}
            >
              {activeEnxoval?.name ?? 'Enxoval'}
            </h1>
            {hasEnxoval && (
              <div
                className="w-fit overflow-hidden whitespace-nowrap rounded-full bg-stone-50 px-2.5 py-1 text-[11px] font-semibold leading-none text-stone-600 ring-1 ring-stone-200 shadow-sm transition-[opacity,max-height,margin,padding,transform] duration-300 ease-out sm:hidden"
                style={totalSpentTitleStyle}
                title="Soma dos itens marcados como concluídos menos descontos e cashback"
              >
                <span className="text-stone-400">Total gasto</span> {checkedTotalSpentText}
              </div>
            )}
            <div
              className="flex items-center gap-2 text-xs text-stone-500 overflow-hidden transition-[opacity,max-height,margin,transform] duration-300 ease-out"
              style={metaStyle}
            >
              <User size={14} />
              <span className="truncate max-w-[190px]">{user.email}</span>
              <span className="inline-flex items-center gap-1 text-stone-400">
                <Users size={14} />
                {members.length}
              </span>
              <button
                type="button"
                onClick={handleLogout}
                className="ml-1 inline-flex items-center gap-1 text-stone-500 hover:text-brand-dark transition-colors"
              >
                <LogOut size={14} />
                Sair
              </button>
            </div>
          </div>

          <div className="shrink-0 flex flex-col items-end gap-1.5" style={headerMetricsStyle}>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleRefresh()}
                disabled={isRefreshing || isWorkspaceLoading}
                aria-label="Atualizar enxoval"
                title="Atualizar enxoval"
                className="inline-flex h-9 w-9 items-center justify-center text-brand-wood transition-colors hover:text-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw size={18} className={isRefreshing ? 'animate-spin' : ''} />
              </button>

              <div
                className="flex flex-col items-center justify-center bg-stone-50 w-16 h-16 rounded-full border-4 border-brand-beige relative overflow-hidden shadow-inner transition-[width,height,border-width] duration-300 ease-out sm:w-16 sm:h-16 sm:border-4"
                style={progressCircleStyle}
              >
                <span className="text-lg sm:text-lg font-bold text-brand-wood z-10 transition-[font-size] duration-300 ease-out" style={progressTextStyle}>{progressStats.percentage}%</span>
                <div
                  className="absolute bottom-0 left-0 w-full bg-brand-beige/30 transition-all duration-500 ease-in-out"
                  style={{ height: `${progressStats.percentage}%` }}
                />
              </div>
            </div>
            {hasEnxoval && (
              <div
                className="overflow-hidden whitespace-nowrap rounded-full bg-stone-50 px-2.5 py-1 text-[11px] font-semibold leading-none text-stone-600 ring-1 ring-stone-200 shadow-sm transition-[opacity,max-height,padding,transform] duration-300 ease-out sm:text-xs"
                style={totalSpentSideStyle}
                title="Soma dos itens marcados como concluídos menos descontos e cashback"
              >
                <span className="text-stone-400">Total gasto</span> {checkedTotalSpentText}
              </div>
            )}
          </div>
        </div>

        {hasEnxoval && (
          <>
            <div
              className="max-w-2xl mx-auto w-full min-w-0 flex items-center gap-2 overflow-hidden transition-[opacity,max-height,margin,transform] duration-300 ease-out"
              style={controlsStyle}
            >
              <select
                value={activeEnxoval?.id ?? ''}
                onChange={(event) => void handleEnxovalChange(event.target.value)}
                disabled={isWorkspaceLoading}
                className="min-w-0 flex-1 px-3 py-2 text-sm border border-stone-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-wood/50 disabled:opacity-60"
              >
                {enxovais.map(enxoval => (
                  <option key={enxoval.id} value={enxoval.id}>{enxoval.name}</option>
                ))}
              </select>

              <div className="inline-flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={openCreateEnxoval}
                  className="inline-flex h-9 items-center gap-1.5 px-3 text-sm font-medium text-stone-700 bg-stone-100 rounded-lg hover:bg-stone-200 transition-colors"
                >
                  <ListPlus size={16} />
                  Novo
                </button>
                <button
                  type="button"
                  onClick={openInvite}
                  aria-label="Adicionar membro"
                  title="Adicionar membro"
                  className="inline-flex h-9 w-9 items-center justify-center text-white bg-brand-dark rounded-lg hover:bg-black transition-colors"
                >
                  <UserPlus size={18} />
                </button>
                <button
                  type="button"
                  onClick={openDiscounts}
                  aria-label={discountsButtonTitle}
                  title={discountsButtonTitle}
                  className="inline-flex h-9 w-9 items-center justify-center text-brand-wood bg-stone-100 rounded-lg hover:bg-brand-beige/20 transition-colors"
                >
                  <Percent size={17} />
                </button>
              </div>

              {isOwner && (
                <div className="inline-flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={openRenameEnxoval}
                    aria-label="Editar nome do enxoval"
                    title="Editar nome do enxoval"
                    className="inline-flex h-9 w-9 items-center justify-center text-stone-600 bg-stone-100 rounded-lg hover:bg-stone-200 transition-colors"
                  >
                    <Pencil size={17} />
                  </button>
                  <button
                    type="button"
                    onClick={openDeleteEnxoval}
                    aria-label="Excluir enxoval"
                    title="Excluir enxoval"
                    className="inline-flex h-9 w-9 items-center justify-center text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              )}
            </div>

            <div
              className="max-w-2xl mx-auto mt-5 sm:mt-6 -mx-4 sm:-mx-6 px-4 sm:px-6 overflow-x-auto no-scrollbar transition-[margin] duration-300 ease-out"
              style={categoryBarStyle}
            >
              <div className="flex w-max min-w-full items-center gap-2 pb-2">
                {categories.map(cat => {
                  const catItems = items.filter(i => i.categoryId === cat.id);
                  const catCompleted = catItems.filter(i => i.checked).length;

                  return (
                    <button
                      key={cat.id}
                      onClick={() => setActiveCategoryId(cat.id)}
                      style={categoryButtonStyle}
                      className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ease-out flex items-center gap-2 ${
                        activeCategory?.id === cat.id
                          ? 'bg-brand-wood text-white shadow-md'
                          : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                      }`}
                    >
                      {cat.name}
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeCategory?.id === cat.id ? 'bg-white/20' : 'bg-stone-200'}`}>
                        {catCompleted}/{catItems.length}
                      </span>
                    </button>
                  );
                })}

                <div className="ml-auto shrink-0 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={openReorderCategories}
                    disabled={categories.length < 2}
                    className="px-3 py-2 rounded-full text-sm font-medium transition-all duration-300 ease-out inline-flex items-center gap-1.5 bg-stone-100 text-stone-700 hover:bg-stone-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Pencil size={15} />
                    Reordenar
                  </button>
                  <button
                    type="button"
                    onClick={openCreateCategory}
                    aria-label="Adicionar categoria"
                    title="Adicionar categoria"
                    className="px-3 py-2 rounded-full text-sm font-medium transition-all duration-300 ease-out inline-flex items-center gap-1.5 bg-white text-brand-wood border border-brand-beige hover:bg-brand-beige/20"
                  >
                    <Plus size={16} />
                    Categoria
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </header>

      <main className="max-w-2xl mx-auto p-4 mt-2">
        {error && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {isWorkspaceLoading && (
          <div className="mb-4 text-sm text-stone-500 bg-white border border-stone-200 rounded-lg px-3 py-2">
            Carregando enxoval...
          </div>
        )}

        {hasEnxoval ? (
          <>
            <div className="mb-4 flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Buscar em todas as categorias"
                  className="w-full rounded-xl border border-stone-200 bg-white py-3 pl-10 pr-11 text-base text-stone-800 shadow-sm outline-none transition focus:border-brand-wood focus:ring-2 focus:ring-brand-wood/30"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Limpar busca"
                    title="Limpar busca"
                    className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setIsFilterOpen(true)}
                aria-label="Abrir filtros"
                title="Filtros"
                className={`relative inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border text-stone-600 shadow-sm transition-colors ${activeFilterCount > 0 ? 'border-brand-beige bg-brand-beige/20 text-brand-dark' : 'border-stone-200 bg-white hover:bg-stone-50'}`}
              >
                <SlidersHorizontal size={18} />
                {activeFilterCount > 0 && (
                  <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-wood px-1 text-[11px] font-bold leading-none text-white">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </div>

            <div
              onPointerDown={handleCategoryListPointerDown}
              onPointerMove={handleCategoryListPointerMove}
              onPointerUp={handleCategoryListPointerEnd}
              onPointerCancel={handleCategoryListPointerCancel}
              className={canSwipeCategories ? 'cursor-grab active:cursor-grabbing' : undefined}
              style={{ touchAction: canSwipeCategories ? 'pan-y' : undefined }}
            >
              <div className={`category-list-swipe ${categorySwipeAnimationClass}`} style={categorySwipeStyle}>
                <div className="mb-4 flex items-center justify-between gap-3 text-sm text-stone-500 font-medium px-1">
                  <span className="min-w-0 truncate">{listTitle}</span>
                  <span className="shrink-0">{listCounterText}</span>
                </div>

                <div className="space-y-1">
                  {filteredItems.length > 0 ? (
                    filteredItems.map(item => (
                      <ItemRow
                        key={item.id}
                        item={item}
                        categoryName={showItemCategory ? categoryById.get(item.categoryId)?.name ?? item.category : undefined}
                        showUpdatedAt={isShowingLatestChanges}
                        updatedAtLabel={formatUpdatedAt(item.updatedAt)}
                        onUpdate={updateItem}
                        onDelete={openDeleteItem}
                        onEdit={openEditItem}
                      />
                    ))
                  ) : (
                    <div className="text-center py-12 px-4">
                      <Sparkles className="w-12 h-12 text-stone-300 mx-auto mb-4" />
                      <h3 className="text-lg font-serif text-stone-600 mb-2">{isSearching ? 'Nenhum resultado' : activeFilterCount > 0 ? 'Nenhum item encontrado' : 'Nenhum item aqui'}</h3>
                      <p className="text-sm text-stone-400">
                        {isSearching
                          ? 'Tente buscar por outro nome, detalhe ou categoria.'
                          : activeFilterCount > 0
                            ? 'Ajuste os filtros para ver mais itens.'
                            : `Toque no botão abaixo para adicionar itens à categoria ${activeCategory?.name ?? 'selecionada'}.`}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="min-h-[45vh] flex items-center justify-center px-2">
            <div className="text-center max-w-sm">
              <Tooth className="w-12 h-12 text-brand-wood mx-auto mb-4" />
              <h2 className="font-serif text-2xl font-bold text-stone-900 mb-2">Crie seu primeiro enxoval</h2>
              <p className="text-sm text-stone-500 mb-6">
                Comece com a lista sugerida ou monte uma lista vazia.
              </p>
              <button
                type="button"
                onClick={openCreateEnxoval}
                className="inline-flex items-center justify-center gap-2 bg-brand-dark text-white rounded-xl px-5 py-3 text-base font-medium hover:bg-black transition-colors"
              >
                <ListPlus size={18} />
                Criar enxoval
              </button>
            </div>
          </div>
        )}
      </main>

      {hasEnxoval && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30">
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="bg-brand-dark text-white rounded-full pl-4 pr-5 py-3 shadow-lg shadow-brand-dark/30 flex items-center gap-2 hover:bg-black transition-transform hover:scale-105 active:scale-95"
          >
            <div className="bg-white/20 rounded-full p-1">
              <Plus size={20} strokeWidth={2.5} />
            </div>
            <span className="font-medium">Adicionar item</span>
          </button>
        </div>
      )}

      <AddItemModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAdd={addItem}
        defaultCategoryId={activeCategory?.id ?? ''}
        categories={categories}
      />

      <Dialog title="Filtros da lista" isOpen={isFilterOpen} onClose={() => setIsFilterOpen(false)}>
        <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-5">
          <div>
            <h4 className="mb-2 text-sm font-semibold text-stone-700">Mostrar</h4>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => {
                  setShowOnlyPricedItems(false);
                  setShowOnlyCheckedItems(false);
                }}
                className={`rounded-xl border px-3 py-3 text-left text-sm font-medium transition-colors ${!hasItemFilters ? 'border-brand-wood bg-brand-beige/20 text-brand-dark' : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'}`}
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => setShowOnlyPricedItems(current => !current)}
                className={`rounded-xl border px-3 py-3 text-left text-sm font-medium transition-colors ${showOnlyPricedItems ? 'border-brand-wood bg-brand-beige/20 text-brand-dark' : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'}`}
              >
                Com preço
              </button>
              <button
                type="button"
                onClick={() => setShowOnlyCheckedItems(current => !current)}
                className={`rounded-xl border px-3 py-3 text-left text-sm font-medium transition-colors ${showOnlyCheckedItems ? 'border-brand-wood bg-brand-beige/20 text-brand-dark' : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'}`}
              >
                Checados
              </button>
            </div>
          </div>

          <div>
            <h4 className="mb-2 text-sm font-semibold text-stone-700">Ordenar</h4>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setItemSortMode('name')}
                className={`rounded-xl border px-3 py-3 text-left text-sm font-medium transition-colors ${itemSortMode === 'name' ? 'border-brand-wood bg-brand-beige/20 text-brand-dark' : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'}`}
              >
                Nome A-Z
              </button>
              <button
                type="button"
                onClick={() => setItemSortMode('updated')}
                className={`rounded-xl border px-3 py-3 text-left text-sm font-medium transition-colors ${itemSortMode === 'updated' ? 'border-brand-wood bg-brand-beige/20 text-brand-dark' : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'}`}
              >
                Últimas alterações
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-stone-100 pt-4">
            <button
              type="button"
              onClick={() => {
                setShowOnlyPricedItems(false);
                setShowOnlyCheckedItems(false);
                setItemSortMode('name');
              }}
              disabled={activeFilterCount === 0}
              className="rounded-xl bg-stone-100 px-4 py-2 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Limpar
            </button>
            <button
              type="button"
              onClick={() => setIsFilterOpen(false)}
              className="rounded-xl bg-brand-dark px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-black"
            >
              Concluir
            </button>
          </div>
        </div>
      </Dialog>
      <Dialog title="Reordenar categorias" isOpen={isReorderCategoriesOpen} onClose={() => setIsReorderCategoriesOpen(false)}>
        <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-4">
          <Reorder.Group axis="y" values={categoryOrder} onReorder={setCategoryOrder} className="space-y-2">
            {categoryOrder.map(category => {
              const categoryItems = items.filter(item => item.categoryId === category.id);

              return (
                <Reorder.Item
                  key={category.id}
                  value={category}
                  className="flex cursor-grab items-center gap-3 rounded-xl border border-stone-200 bg-white px-3 py-3 text-stone-800 shadow-sm active:cursor-grabbing"
                  style={{ touchAction: 'none' }}
                >
                  <GripVertical size={18} className="shrink-0 text-stone-400" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{category.name}</span>
                  <span className="shrink-0 rounded-full bg-stone-100 px-2 py-1 text-xs font-semibold text-stone-500">
                    {categoryItems.length}
                  </span>
                </Reorder.Item>
              );
            })}
          </Reorder.Group>

          {dialogError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {dialogError}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setIsReorderCategoriesOpen(false)}
              disabled={isDialogSubmitting}
              className="py-4 bg-stone-100 text-stone-700 rounded-xl font-medium text-base hover:bg-stone-200 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleSaveCategoryOrder()}
              disabled={isDialogSubmitting || !activeEnxoval}
              className="py-4 bg-brand-dark text-white rounded-xl font-medium text-base hover:bg-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDialogSubmitting ? 'Salvando...' : 'Salvar ordem'}
            </button>
          </div>
        </div>
      </Dialog>
      <Dialog title="Nova categoria" isOpen={isCreateCategoryOpen} onClose={() => setIsCreateCategoryOpen(false)}>
        <form onSubmit={handleCreateCategory} className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Nome da categoria</label>
            <input
              type="text"
              value={newCategoryName}
              onChange={(event) => setNewCategoryName(event.target.value)}
              placeholder="Ex: Escritório"
              className="w-full px-4 py-3 text-base border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-wood/50 focus:border-brand-wood"
            />
          </div>

          {dialogError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {dialogError}
            </p>
          )}

          <button
            type="submit"
            disabled={!newCategoryName.trim() || isDialogSubmitting || !activeEnxoval}
            className="w-full py-4 bg-brand-dark text-white rounded-xl font-medium text-lg hover:bg-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDialogSubmitting ? 'Criando...' : 'Criar categoria'}
          </button>
        </form>
      </Dialog>

      <Dialog title="Novo enxoval" isOpen={isCreateEnxovalOpen} onClose={() => setIsCreateEnxovalOpen(false)}>
        <form onSubmit={handleCreateEnxoval} className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Nome do enxoval</label>
            <input
              type="text"
              value={newEnxovalName}
              onChange={(event) => setNewEnxovalName(event.target.value)}
              placeholder="Ex: Apartamento novo"
              className="w-full px-4 py-3 text-base border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-wood/50 focus:border-brand-wood"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Modelo inicial</label>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-stone-100 p-1">
              <button
                type="button"
                onClick={() => setNewEnxovalUseDefaultTemplate(true)}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${newEnxovalUseDefaultTemplate ? 'bg-white text-brand-dark shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
              >
                Lista sugerida
              </button>
              <button
                type="button"
                onClick={() => setNewEnxovalUseDefaultTemplate(false)}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${!newEnxovalUseDefaultTemplate ? 'bg-white text-brand-dark shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
              >
                Vazio
              </button>
            </div>
          </div>

          {dialogError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {dialogError}
            </p>
          )}

          <button
            type="submit"
            disabled={!newEnxovalName.trim() || isDialogSubmitting}
            className="w-full py-4 bg-brand-dark text-white rounded-xl font-medium text-lg hover:bg-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDialogSubmitting ? 'Criando...' : 'Criar enxoval'}
          </button>
        </form>
      </Dialog>

      <Dialog title="Descontos e cashback" isOpen={isDiscountsOpen} onClose={() => setIsDiscountsOpen(false)}>
        <form onSubmit={handleSaveDiscounts} className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Operação</label>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-stone-100 p-1">
              <button
                type="button"
                onClick={() => setDiscountOperation('add')}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${discountOperation === 'add' ? 'bg-white text-brand-dark shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
              >
                Somar
              </button>
              <button
                type="button"
                onClick={() => setDiscountOperation('subtract')}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${discountOperation === 'subtract' ? 'bg-white text-brand-dark shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
              >
                Subtrair
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Valor do ajuste</label>
            <div className="flex items-center gap-2">
              <input
                ref={discountAdjustmentInputRef}
                type="text"
                inputMode="numeric"
                value={discountAdjustmentText}
                onChange={handleDiscountAdjustmentChange}
                placeholder="R$ 0,00"
                className="min-w-0 flex-1 px-4 py-3 text-base border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-wood/50 focus:border-brand-wood"
              />
              <button
                type="button"
                onPointerDown={(event) => event.preventDefault()}
                onMouseDown={(event) => event.preventDefault()}
                onClick={handleApplyDiscountAdjustment}
                disabled={discountAdjustmentCents <= 0}
                aria-label={discountOperation === 'add' ? 'Somar ajuste na prévia' : 'Subtrair ajuste da prévia'}
                title={discountOperation === 'add' ? 'Somar ajuste na prévia' : 'Subtrair ajuste da prévia'}
                className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${discountOperation === 'add' ? 'bg-brand-wood hover:bg-brand-wood/90' : 'bg-stone-700 hover:bg-stone-800'}`}
              >
                {discountOperation === 'add' ? <Plus size={20} /> : <Minus size={20} />}
              </button>
            </div>
          </div>

          <div className="rounded-xl bg-stone-50 p-3 text-sm text-stone-600 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span>Subtotal marcado</span>
              <strong className="text-stone-800">{checkedSubtotalSpentText}</strong>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Desconto atual</span>
              <strong className="text-brand-wood">- {savedDiscountText}</strong>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>{discountOperation === 'add' ? 'Ajuste para somar' : 'Ajuste para subtrair'}</span>
              <strong className={discountOperation === 'add' ? 'text-brand-wood' : 'text-stone-700'}>
                {discountOperation === 'add' ? '+ ' : '- '}{discountAdjustmentPreviewText}
              </strong>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-stone-200 pt-2">
              <span>Novo desconto total</span>
              <strong className="text-brand-wood">- {workingDiscountText}</strong>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-stone-200 pt-2">
              <span>Total gasto</span>
              <strong className="text-stone-900">{discountPreviewTotalText}</strong>
            </div>
          </div>

          {dialogError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {dialogError}
            </p>
          )}

          <button
            type="submit"
            disabled={isDialogSubmitting || !activeEnxoval || discountWorkingCents === enxovalDiscountCents}
            className="w-full py-4 bg-brand-dark text-white rounded-xl font-medium text-lg hover:bg-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDialogSubmitting ? 'Salvando...' : 'Salvar ajuste'}
          </button>
        </form>
      </Dialog>
      <Dialog title="Editar enxoval" isOpen={isRenameEnxovalOpen} onClose={() => setIsRenameEnxovalOpen(false)}>
        <form onSubmit={handleRenameEnxoval} className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Nome do enxoval</label>
            <input
              type="text"
              value={renameEnxovalName}
              onChange={(event) => setRenameEnxovalName(event.target.value)}
              placeholder="Ex: Apartamento novo"
              className="w-full px-4 py-3 text-base border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-wood/50 focus:border-brand-wood"
            />
          </div>

          {dialogError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {dialogError}
            </p>
          )}

          <button
            type="submit"
            disabled={!renameEnxovalName.trim() || isDialogSubmitting}
            className="w-full py-4 bg-brand-dark text-white rounded-xl font-medium text-lg hover:bg-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDialogSubmitting ? 'Salvando...' : 'Salvar nome'}
          </button>
        </form>
      </Dialog>

      <Dialog title="Excluir enxoval" isOpen={isDeleteEnxovalOpen} onClose={() => setIsDeleteEnxovalOpen(false)}>
        <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-4">
          <p className="text-sm text-stone-600">
            Esta ação vai excluir o enxoval {activeEnxoval ? `"${activeEnxoval.name}"` : ''}, incluindo categorias, itens e colaboradores.
          </p>

          {dialogError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {dialogError}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setIsDeleteEnxovalOpen(false)}
              disabled={isDialogSubmitting}
              className="py-4 bg-stone-100 text-stone-700 rounded-xl font-medium text-base hover:bg-stone-200 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleDeleteEnxoval()}
              disabled={isDialogSubmitting || !activeEnxoval}
              className="py-4 bg-red-600 text-white rounded-xl font-medium text-base hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDialogSubmitting ? 'Excluindo...' : 'Excluir'}
            </button>
          </div>
        </div>
      </Dialog>
      <Dialog title="Editar item" isOpen={Boolean(itemToEdit)} onClose={closeEditItem}>
        <form onSubmit={handleSaveItemDetails} className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Nome do item</label>
            <input
              type="text"
              value={editItemName}
              onChange={(event) => setEditItemName(event.target.value)}
              placeholder="Ex: Jogo de Taças"
              className="w-full px-4 py-3 text-base border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-wood/50 focus:border-brand-wood"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Categoria</label>
            <select
              value={editItemCategoryId}
              onChange={(event) => setEditItemCategoryId(event.target.value)}
              disabled={categories.length === 0}
              className="w-full px-4 py-3 text-base border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-wood/50 focus:border-brand-wood bg-white disabled:bg-stone-100 disabled:text-stone-400"
            >
              {categories.map(category => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Link do produto</label>
            <div className="flex items-center gap-2">
              <input
                type="url"
                value={editItemLink}
                onChange={(event) => setEditItemLink(event.target.value)}
                placeholder="https://..."
                className="flex-1 min-w-0 px-4 py-3 text-base border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-wood/50 focus:border-brand-wood"
              />
              {editItemProductUrl && (
                <a
                  href={editItemProductUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-wood text-white transition-colors hover:bg-brand-wood/90"
                  aria-label="Abrir link do produto"
                  title="Abrir link do produto"
                >
                  <ExternalLink size={18} />
                </a>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Preço</label>
            <input
              type="text"
              inputMode="numeric"
              value={editItemPriceText}
              onChange={handleEditItemPriceChange}
              placeholder="R$ 0,00"
              className="w-full px-4 py-3 text-base border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-wood/50 focus:border-brand-wood"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Detalhes / Descrição</label>
            <textarea
              value={editItemDescription}
              onChange={(event) => setEditItemDescription(event.target.value)}
              placeholder="Ex: Comprar na cor branca, voltagem 110 V..."
              rows={3}
              className="w-full px-4 py-3 text-base border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-wood/50 focus:border-brand-wood resize-none"
            />
          </div>

          {dialogError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {dialogError}
            </p>
          )}

          <button
            type="submit"
            disabled={isDialogSubmitting || !itemToEdit || !editItemName.trim() || !editItemCategoryId}
            className="w-full py-4 bg-brand-dark text-white rounded-xl font-medium text-lg hover:bg-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDialogSubmitting ? 'Salvando...' : 'Salvar detalhes'}
          </button>
        </form>
      </Dialog>
      <Dialog title="Excluir item" isOpen={Boolean(itemToDelete)} onClose={() => setItemToDelete(null)}>
        <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-4">
          <p className="text-sm text-stone-600">
            Esta ação vai remover o item {itemToDelete ? `"${itemToDelete.name}"` : ''} da lista.
          </p>

          {dialogError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {dialogError}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setItemToDelete(null)}
              disabled={isDialogSubmitting}
              className="py-4 bg-stone-100 text-stone-700 rounded-xl font-medium text-base hover:bg-stone-200 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleDeleteItem()}
              disabled={isDialogSubmitting || !itemToDelete}
              className="py-4 bg-red-600 text-white rounded-xl font-medium text-base hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDialogSubmitting ? 'Excluindo...' : 'Excluir'}
            </button>
          </div>
        </div>
      </Dialog>
      <Dialog title="Convidar pessoa" isOpen={isInviteOpen} onClose={() => setIsInviteOpen(false)}>
        <form onSubmit={handleInviteMember} className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">E-mail da pessoa</label>
            <input
              type="email"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              placeholder="pessoa@email.com"
              className="w-full px-4 py-3 text-base border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-wood/50 focus:border-brand-wood"
            />
          </div>

          {members.length > 0 && (
            <div className="max-h-32 overflow-y-auto rounded-xl border border-stone-100 bg-stone-50">
              {members.map(member => (
                <div key={member.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm border-b border-stone-100 last:border-0">
                  <span className="truncate text-stone-700">{member.email}</span>
                  <span className="text-xs font-medium text-stone-400">{member.role === 'owner' ? 'dono' : 'editor'}</span>
                </div>
              ))}
            </div>
          )}

          {dialogError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {dialogError}
            </p>
          )}

          <button
            type="submit"
            disabled={!inviteEmail.trim() || isDialogSubmitting || !activeEnxoval}
            className="w-full py-4 bg-brand-dark text-white rounded-xl font-medium text-lg hover:bg-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDialogSubmitting ? 'Convidando...' : 'Convidar'}
          </button>
        </form>
      </Dialog>
    </div>
  );
}
