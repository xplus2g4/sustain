import type { Quote } from '../pricing/quote';

export type Payment = { reference: string; amount: number };

const gateway = {
  async pay(amount: number): Promise<string> { return `pay-${amount.toFixed(2)}`; },
};

export async function charge(quote: Quote): Promise<Payment> {
  const reference = await gateway.pay(quote.total);
  return { reference, amount: quote.total };
}
