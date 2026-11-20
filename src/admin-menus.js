export const ADMIN_MENUS = [
  { key: 'personnel', label: '人员管理' },
  { key: 'finance', label: '财务管理' },
  { key: 'meals', label: '餐食管理' },
  { key: 'tools', label: '实用工具', platformOnly: true },
];

export const INSTITUTION_ADMIN_MENUS = ADMIN_MENUS.filter(({ platformOnly }) => !platformOnly);

export function adminMenuKeys(account) {
  if (!account) return [];
  const keys = Array.isArray(account.menuKeys) ? account.menuKeys : ['personnel'];
  if (account.role === 'platform') return keys;
  return keys.filter(key => INSTITUTION_ADMIN_MENUS.some(menu => menu.key === key));
}

export function canAccessAdminMenu(account, key) {
  return account?.role === 'platform' || adminMenuKeys(account).includes(key);
}
