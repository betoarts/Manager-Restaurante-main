// Default permissions: each role gets a list of allowed paths
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: [
    '/',
    '/pdv',
    '/mesas',
    '/kds/cozinha',
    '/kds/bar',
    '/kds/sobremesa',
    '/estoque',
    '/compras',
    '/financeiro',
    '/configs',
    '/garcom',
  ],
  gerente: [
    '/',
    '/pdv',
    '/mesas',
    '/kds/cozinha',
    '/kds/bar',
    '/kds/sobremesa',
    '/estoque',
    '/compras',
    '/financeiro',
    '/configs',
    '/garcom',
  ],
  caixa: [
    '/pdv',
    '/mesas',
  ],
  cozinha: [
    '/kds/cozinha',
    '/kds/bar',
    '/kds/sobremesa',
  ],
  garcom: [
    '/garcom',
  ],
  entregador: [
    '/',
  ],
};

// Load permissions from localStorage (may have custom overrides)
function loadCustomPermissions(): Record<string, string[]> | null {
  try {
    const stored = localStorage.getItem('role_permissions');
    if (stored) return JSON.parse(stored);
  } catch {}
  return null;
}

// Get allowed paths for a role (checks localStorage first, then defaults)
export function getAllowedPaths(role: string | undefined): string[] {
  if (!role) return [];
  const custom = loadCustomPermissions();
  if (custom && custom[role]) return custom[role];
  return ROLE_PERMISSIONS[role] || [];
}

// Check if a role can access a path
export function canAccess(role: string | undefined, path: string): boolean {
  if (!role) return false;
  const allowed = getAllowedPaths(role);
  return allowed.some((p) => path === p || (p !== '/' && path.startsWith(p)));
}

// Menu items with their required roles
export interface MenuItemDef {
  text: string;
  path: string;
  roles: string[];
}

export const PROTECTED_MENU_ITEMS: MenuItemDef[] = [
  { text: 'Dashboard', path: '/', roles: ['admin', 'gerente'] },
  { text: 'PDV (Venda Rápida)', path: '/pdv', roles: ['admin', 'gerente', 'caixa'] },
  { text: 'Mapa de Mesas', path: '/mesas', roles: ['admin', 'gerente', 'caixa'] },
  { text: 'KDS Cozinha', path: '/kds/cozinha', roles: ['admin', 'gerente', 'cozinha'] },
  { text: 'KDS Bar', path: '/kds/bar', roles: ['admin', 'gerente', 'cozinha'] },
  { text: 'KDS Sobremesa', path: '/kds/sobremesa', roles: ['admin', 'gerente', 'cozinha'] },
  { text: 'Estoque', path: '/estoque', roles: ['admin', 'gerente'] },
  { text: 'Compras', path: '/compras', roles: ['admin', 'gerente'] },
  { text: 'Financeiro', path: '/financeiro', roles: ['admin', 'gerente'] },
  { text: 'Configurações', path: '/configs', roles: ['admin', 'gerente'] },
];

// Get menu items visible for a role
export function getMenuForRole(role: string | undefined): MenuItemDef[] {
  if (!role) return [];
  return PROTECTED_MENU_ITEMS.filter((item) => item.roles.includes(role));
}

// Get the home redirect path for a role
export function getHomeForRole(role: string | undefined): string {
  if (!role) return '/login';
  switch (role) {
    case 'garcom': return '/garcom';
    case 'cozinha': return '/kds/cozinha';
    case 'caixa': return '/pdv';
    default: return '/';
  }
}
