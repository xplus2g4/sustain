import { price } from '../pricing/quote';
import { charge } from '../payments/charge';
import { create } from '../orders/store';

export type Cart = {
  id: string;
  region: string;
  items: Array<{ unitPrice: number; quantity: number }>;
};

export type CheckoutResult = {
  orderId: string;
  total: number;
};

// A checkout crosses three components. The map cites this entrypoint so a
// reader can follow the quote, payment, and order without guessing at names.

export async function checkout(cart: Cart): Promise<CheckoutResult> {
  const quote = price(cart);
  const payment = await charge(quote);
  const order = await create(payment);
  return { orderId: order.id, total: quote.total };
}
