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

  // Order tracking quick actions (avoid embedding long ids in button payloads).
  REORDER_CURRENT: 'reorder_current',

  ADD_CART: 'add_cart',
  PICK_QTY: 'pick_qty',

  COUPON_APPLY_SUGGESTED: 'coupon_apply_suggested',
  COUPON_APPLY_BEST: 'coupon_apply_best',
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
  CHANGE_ADDRESS: 'change_address',

  CART_INC: 'cart_inc',
  CART_DEC: 'cart_dec',
  CART_RM: 'cart_rm',
} as const;

export const Btn = {
  product: (id: string) => `prod_${id}`,
  category: (id: string) => `cat_${id}`,
  order: (id: string) => `order_${id}`,
  reorder: (id: string) => `reorder_${id}`,
  payOrder: (id: string) => `pay_${id}`,
  address: (i: number) => `address_${i}`,
  applyCoupon: (code: string) => `capply_${code}`,
  addQty: (n: number) => `qty_${n}`,
  cartItem: (i: number) => `citem_${i}`,
};

export type ParsedButton =
  | { kind: 'product'; id: string }
  | { kind: 'category'; id: string }
  | { kind: 'order'; id: string }
  | { kind: 'reorder'; id: string }
  | { kind: 'payOrder'; id: string }
  | { kind: 'address'; idx: number }
  | { kind: 'applyCoupon'; code: string }
  | { kind: 'addQty'; qty: number }
  | { kind: 'cartItem'; idx: number }
  | { kind: 'static'; value: string };

const PREFIX_RE = /^(prod|cat|order|reorder|pay|address|addr|capply|qty|citem)_(.+)$/;

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
    case 'pay':      return { kind: 'payOrder', id: rest };
    case 'address':
    case 'addr':     return { kind: 'address', idx };
    case 'capply':   return { kind: 'applyCoupon', code: rest };
    case 'qty': {
      const qty = Number.parseInt(rest, 10);
      return Number.isFinite(qty) && qty > 0
        ? { kind: 'addQty', qty }
        : { kind: 'static', value: raw };
    }
    case 'citem':
      return Number.isFinite(idx) ? { kind: 'cartItem', idx } : { kind: 'static', value: raw };
    default:         return { kind: 'static', value: raw };
  }
}
