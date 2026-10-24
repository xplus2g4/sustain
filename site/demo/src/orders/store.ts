import type { Payment } from '../payments/charge';

export type Order = { id: string; paymentReference: string };

const orders: Order[] = [];

export async function create(payment: Payment): Promise<Order> {
  const order = { id: `order-${orders.length + 1}`, paymentReference: payment.reference };
  orders.push(order);
  return order;
}
