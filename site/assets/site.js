(() => {
  const menuButton = document.querySelector('.menu-toggle');
  const mobileNav = document.querySelector('#mobile-nav');
  if (menuButton && mobileNav) {
    menuButton.addEventListener('click', () => {
      const open = menuButton.getAttribute('aria-expanded') !== 'true';
      menuButton.setAttribute('aria-expanded', String(open));
      menuButton.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
      mobileNav.hidden = !open;
    });
    mobileNav.addEventListener('click', (event) => {
      if (event.target.closest('a')) {
        mobileNav.hidden = true;
        menuButton.setAttribute('aria-expanded', 'false');
        menuButton.setAttribute('aria-label', 'Open navigation');
      }
    });
  }

  const demo = document.querySelector('.demo-frame');
  if (demo) {
    const content = {
      checkout: {
        title: 'Checkout API', file: 'src/checkout/route.ts', lines: '19–24',
        description: 'Receives the cart, asks Pricing for a quote, and starts the payment.',
        code: ['export async function checkout(cart: Cart): Promise&lt;CheckoutResult&gt; {', '  const quote = price(cart);', '  const payment = await charge(quote);', '  const order = await create(payment);', '  return { orderId: order.id, total: quote.total };', '}'], start: 19
      },
      pricing: {
        title: 'Pricing', file: 'src/pricing/quote.ts', lines: '10–14',
        description: 'Applies the current pricing rules and returns a quote for the cart.',
        code: ['export function price(cart: Cart): Quote {', '  const subtotal = cart.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);', '  const tax = subtotal * (taxRate[cart.region] ?? 0);', "  return { total: Math.round((subtotal + tax) * 100) / 100, currency: 'USD' };", '}'], start: 10
      },
      payment: {
        title: 'Payments', file: 'src/payments/charge.ts', lines: '9–12',
        description: 'Charges the quoted amount and returns a payment reference.',
        code: ['export async function charge(quote: Quote): Promise&lt;Payment&gt; {', '  const reference = await gateway.pay(quote.total);', '  return { reference, amount: quote.total };', '}'], start: 9
      },
      order: {
        title: 'Orders', file: 'src/orders/store.ts', lines: '7–11',
        description: 'Records the completed order against its payment reference.',
        code: ['export async function create(payment: Payment): Promise&lt;Order&gt; {', '  const order = { id: `order-${orders.length + 1}`, paymentReference: payment.reference };', '  orders.push(order);', '  return order;', '}'], start: 7
      }
    };
    let selected = 'checkout';
    let changed = false;
    const render = () => {
      const item = content[selected];
      document.querySelector('#demo-title').textContent = item.title;
      document.querySelector('#demo-desc').textContent = item.description;
      const fileLink = document.querySelector('#demo-file');
      fileLink.innerHTML = `${item.file} <span>${item.lines} ↗</span>`;
      fileLink.href = `demo/${item.file}`;
      document.querySelector('#demo-code code').innerHTML = item.code.map((line, index) => `<span class="line-no">${item.start + index}</span> ${line}`).join('\n');
      const edited = changed && selected === 'pricing';
      document.querySelector('#demo-status').textContent = edited ? 'Cited code changed after this map' : 'Citation matches the current code';
      demo.classList.toggle('is-changed', changed);
      demo.querySelectorAll('[data-node]').forEach((node) => {
        const active = node.dataset.node === selected;
        node.classList.toggle('is-selected', active);
        node.setAttribute('aria-pressed', String(active));
        const state = node.querySelector('.node-state');
        state.textContent = changed && node.dataset.node === 'pricing' ? 'EDITED' : 'FRESH';
      });
      demo.querySelectorAll('[data-state]').forEach((button) => {
        const active = button.dataset.state === (changed ? 'changed' : 'fresh');
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
      });
    };
    demo.querySelectorAll('[data-node]').forEach((button) => button.addEventListener('click', () => { selected = button.dataset.node; render(); }));
    demo.querySelectorAll('[data-state]').forEach((button) => button.addEventListener('click', () => { changed = button.dataset.state === 'changed'; if (changed) selected = 'pricing'; render(); }));
    render();
  }

  document.querySelectorAll('[data-tabs]').forEach((group) => {
    const tabs = [...group.querySelectorAll('[role="tab"]')];
    const panels = [...group.querySelectorAll('[role="tabpanel"]')];
    const select = (tab, moveFocus = false) => {
      tabs.forEach((item) => {
        const active = item === tab;
        item.setAttribute('aria-selected', String(active));
        item.tabIndex = active ? 0 : -1;
      });
      panels.forEach((panel) => { panel.hidden = panel.id !== tab.getAttribute('aria-controls'); });
      if (moveFocus) tab.focus();
    };
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => select(tab));
      tab.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        select(tabs[next], true);
      });
    });
    const initial = tabs.find((tab) => tab.getAttribute('aria-selected') === 'true') || tabs[0];
    if (initial) select(initial);
  });

  document.querySelectorAll('[data-copy]').forEach((button) => {
    button.addEventListener('click', async () => {
      const code = button.closest('.code-slab')?.querySelector('code')?.textContent;
      if (!code) return;
      try {
        await navigator.clipboard.writeText(code.trim());
        const previous = button.textContent;
        button.textContent = 'Copied';
        setTimeout(() => { button.textContent = previous; }, 1600);
      } catch {
        button.textContent = 'Select code to copy';
      }
    });
  });

  const docsLinks = [...document.querySelectorAll('.docs-sidebar a[href^="#"]')];
  if (docsLinks.length && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      docsLinks.forEach((link) => link.classList.toggle('active', link.hash === `#${visible.target.id}`));
    }, { rootMargin: '-18% 0px -58% 0px', threshold: [0, .25, .5] });
    docsLinks.forEach((link) => { const section = document.querySelector(link.hash); if (section) observer.observe(section); });
  }
})();
