export const BTN = {
  BROWSE: 'browse',
  CART: 'cart',
  ORDERS: 'orders',
  ACCOUNT: 'account',
  HELP: 'help',
  SUPPORT: 'support',
  BACK: 'back',
  MENU: 'menu',

  CHECKOUT: 'checkout',
  MANAGE_CART: 'manage',
  KEEP_SHOPPING: 'continue_shopping',
  VIEW_CART: 'view_cart',

  ADD_CART: 'add_cart',
  BUY_NOW: 'buy_now',

  COUPON_APPLY_SUGGESTED: 'coupon_apply_suggested',
  COUPON_YES: 'coupon_yes',
  COUPON_NO: 'coupon_no',
  COUPON_CUSTOM: 'coupon_custom',
  COUPON_SKIP: 'skip_coupon',
  COUPON_REMOVE: 'remove_coupon',
  COUPON_TRY_AGAIN: 'try_coupon_again',
  COUPON_LIST: 'coupon_list',

  COD: 'cod',
  PREPAID: 'prepaid',

  MORE_CATEGORIES: 'more_categories',
  MORE_PRODUCTS: 'more_products',
  MORE_ORDERS: 'more_orders',

  ADD_NEW_ADDRESS: 'new_address',

  CLEAR_CART: 'clear',
} as const;

export const Btn = {
  product: (id: string) => `prod_${id}`,
  category: (id: string) => `cat_${id}`,
  order: (id: string) => `order_${id}`,
  reorder: (id: string) => `reorder_${id}`,
  address: (i: number) => `address_${i}`,
  manageItem: (i: number) => `mi_${i}`,
  incItem: (i: number) => `inc_${i}`,
  decItem: (i: number) => `dec_${i}`,
  delItem: (i: number) => `del_${i}`,
  applyCoupon: (code: string) => `capply_${code}`,
};

export type ParsedButton =
  | { kind: 'product'; id: string }
  | { kind: 'category'; id: string }
  | { kind: 'order'; id: string }
  | { kind: 'reorder'; id: string }
  | { kind: 'address'; idx: number }
  | { kind: 'manageItem'; idx: number }
  | { kind: 'incItem'; idx: number }
  | { kind: 'decItem'; idx: number }
  | { kind: 'delItem'; idx: number }
  | { kind: 'applyCoupon'; code: string }
  | { kind: 'static'; value: string };

const PREFIX_RE = /^(prod|cat|order|reorder|address|addr|mi|inc|dec|del|rm|capply)_(.+)$/;

export function parseButton(id: string | undefined | null): ParsedButton {
  const raw = (id ?? '').trim();
  if (!raw) return { kind: 'static', value: '' };
  const m = raw.match(PREFIX_RE);
  if (!m) return { kind: 'static', value: raw };
  const [, prefix, rest] = m;
  const idx = Number.parseInt(rest, 10);
  switch (prefix) {
    case 'prod':     return { kind: 'product', id: rest };
    case 'cat':      return { kind: 'category', id: rest };
    case 'order':    return { kind: 'order', id: rest };
    case 'reorder':  return { kind: 'reorder', id: rest };
    case 'address':
    case 'addr':     return { kind: 'address', idx };
    case 'mi':       return { kind: 'manageItem', idx };
    case 'inc':      return { kind: 'incItem', idx };
    case 'dec':      return { kind: 'decItem', idx };
    case 'del':
    case 'rm':       return { kind: 'delItem', idx };
    case 'capply':   return { kind: 'applyCoupon', code: rest };
    default:         return { kind: 'static', value: raw };
  }
}
