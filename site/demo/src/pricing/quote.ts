import type { Cart } from '../checkout/route';

export type Quote = { total: number; currency: 'USD' };

const taxRate: Record<string, number> = {
  US: 0.07,
  SG: 0.09,
};

export function price(cart: Cart): Quote {
  const subtotal = cart.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const tax = subtotal * (taxRate[cart.region] ?? 0);
  return { total: Math.round((subtotal + tax) * 100) / 100, currency: 'USD' };
}
