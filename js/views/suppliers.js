import { centsToInput, formatQty, html, normalize, parseMoney, parseQty } from '../core.js';
import {
  allPurchases, deleteSupplier, getSupplier, listSuppliers, purchasesOf, registerPurchase, saveSupplier, state, UserError,
} from '../services.js';
import { COMMON_SUPPLIERS } from '../suppliers-common.js';
import { backLink, chevron, confirmDialog, dateTime, isView, money, monogram, onSubmit, openModal, setHTML, showError, thumb, toast } from '../ui.js';

let root;

const monthStart = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
};
const sum = (list) => list.reduce((a, p) => a + p.total, 0);
const unitLabel = (unit) => (unit === 'pza' ? 'pz' : unit);

function supplierForm(existing, onSaved) {
  const s = existing || { name: '', phone: '', visitDays: '', notes: '' };
  openModal(html`
    <form class="modal-body">
      <div class="sheet-head">
        <button type="button" class="link" data-close>Cancelar</button>
        <h2>${existing ? 'Editar proveedor' : 'Proveedor nuevo'}</h2>
        <button class="link link-strong">Guardar</button>
      </div>
      <label class="field">Nombre <input name="name" required maxlength="80" value="${s.name}" autocomplete="off" ${existing ? '' : html`autofocus`}></label>
      <label class="field">Teléfono del repartidor <input name="phone" inputmode="tel" maxlength="20" value="${s.phone}" autocomplete="off"></label>
      <label class="field">¿Qué días pasa? <input name="visitDays" maxlength="60" value="${s.visitDays}" placeholder="Ej. lunes y jueves" autocomplete="off"></label>
      <label class="field">Notas <input name="notes" maxlength="160" value="${s.notes}" placeholder="Ej. pide el pedido un día antes" autocomplete="off"></label>
      ${existing && html`<button type="button" class="btn btn-plain btn-ghost-danger" data-delete>Borrar proveedor</button>`}
    </form>
  `, (dialog, close) => {
    onSubmit(dialog.querySelector('form'), async (values) => {
      const saved = await saveSupplier({ id: existing?.id, ...values });
      close();
      toast(existing ? 'Proveedor actualizado' : 'Proveedor agregado');
      onSaved(saved);
    });
    dialog.querySelector('[data-delete]')?.addEventListener('click', async () => {
      const ok = await confirmDialog({ title: 'Borrar proveedor', message: `¿Borrar a ${existing.name}?`, action: 'Borrar', danger: true });
      if (!ok) return;
      try {
        await deleteSupplier(existing.id);
        close();
        toast('Proveedor borrado');
        location.hash = '#proveedores';
      } catch (error) { showError(error); }
    });
  });
}

// Registrar lo que entregó el proveedor: productos, cantidades y costo. Suma existencias y actualiza costos.
function purchaseSheet(supplier, onDone) {
  const lines = [];
  openModal(html`
    <form class="modal-body">
      <div class="sheet-head">
        <button type="button" class="link" data-close>Cancelar</button>
        <h2>Compra a ${supplier.name}</h2>
        <span></span>
      </div>
      <div class="search">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#6C6C70" stroke-width="2.4" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>
        <input data-find type="search" placeholder="Busca el producto que te entregó" aria-label="Buscar producto" autocomplete="off">
      </div>
      <div class="group" data-results hidden></div>
      <p class="group-title">LO QUE TE ENTREGÓ</p>
      <div class="group" data-lines></div>
      <div class="row between purchase-total"><strong>Total de la compra</strong><strong class="tabular" data-total>$0</strong></div>
      <label class="field">Nota <input name="note" maxlength="120" placeholder="Opcional, ej. factura 1234" autocomplete="off"></label>
      <button class="btn btn-primary btn-pill">Guardar compra</button>
      <p class="hint">Las existencias se suman al inventario y el costo de cada producto se actualiza.</p>
    </form>
  `, (dialog, close) => {
    const form = dialog.querySelector('form');
    const find = dialog.querySelector('[data-find]');
    const results = dialog.querySelector('[data-results]');
    const box = dialog.querySelector('[data-lines]');

    const updateTotal = () => {
      let total = 0;
      box.querySelectorAll('[data-line]').forEach((row) => {
        const line = lines[Number(row.dataset.line)];
        const lineTotal = line.qty > 0 && line.unitCost >= 0 ? Math.round(line.qty * line.unitCost) : 0;
        row.querySelector('[data-line-total]').textContent = money(lineTotal);
        total += lineTotal;
      });
      dialog.querySelector('[data-total]').textContent = money(total);
    };

    const renderLines = () => {
      setHTML(box, lines.length ? html`${lines.map((line, i) => html`
        <div class="purchase-line" data-line="${i}">
          <div class="row between">
            <span class="row-main"><span class="row-title">${line.name}</span><small>Tenías ${formatQty(line.stock)} ${unitLabel(line.unit)}</small></span>
            <button type="button" class="link link-danger" data-remove="${i}" aria-label="Quitar ${line.name}">Quitar</button>
          </div>
          <div class="form-grid purchase-fields">
            <label class="field">Cantidad (${unitLabel(line.unit)}) <input data-qty inputmode="decimal" value="${line.qtyText}" autocomplete="off"></label>
            <label class="field">Costo por ${unitLabel(line.unit)} <input data-cost inputmode="decimal" value="${line.costText}" autocomplete="off"></label>
          </div>
          <div class="row between"><small class="muted">Subtotal</small><strong class="tabular" data-line-total>$0</strong></div>
        </div>
      `)}` : html`<p class="row muted">Busca arriba los productos que te entregó.</p>`);
      updateTotal();
    };

    const renderResults = () => {
      const words = normalize(find.value).split(/\s+/).filter(Boolean);
      if (!words.length) { results.hidden = true; return; }
      const found = state.products
        .filter((p) => words.every((w) => normalize(`${p.name} ${p.codeList.join(' ')}`).includes(w)))
        .slice(0, 6);
      results.hidden = false;
      setHTML(results, found.length ? html`${found.map((p) => html`
        <button type="button" class="row row-btn" data-add="${p.id}">
          ${thumb(p)}
          <span class="row-main"><span class="row-title">${p.name}</span><small>Costo ${money(p.cost)} · tienes ${formatQty(p.stock)} ${unitLabel(p.unit)}</small></span>
          <span class="plus-dot" aria-hidden="true">+</span>
        </button>
      `)}` : html`<p class="row muted">No está en tu inventario. Agrégalo primero en Inventario.</p>`);
    };

    find.addEventListener('input', renderResults);
    results.addEventListener('click', (event) => {
      const button = event.target.closest('[data-add]');
      if (!button) return;
      const p = state.products.find((x) => x.id === button.dataset.add);
      if (lines.some((l) => l.productId === p.id)) { toast('Ese producto ya está en la compra'); return; }
      lines.push({ productId: p.id, name: p.name, unit: p.unit, stock: p.stock, qty: 0, qtyText: '', unitCost: p.cost, costText: p.cost ? centsToInput(p.cost) : '' });
      find.value = '';
      results.hidden = true;
      renderLines();
      box.querySelector(`[data-line="${lines.length - 1}"] [data-qty]`)?.focus();
    });
    box.addEventListener('input', (event) => {
      const row = event.target.closest('[data-line]');
      if (!row) return;
      const line = lines[Number(row.dataset.line)];
      if (event.target.matches('[data-qty]')) {
        line.qtyText = event.target.value;
        line.qty = parseQty(event.target.value) ?? 0;
      } else if (event.target.matches('[data-cost]')) {
        line.costText = event.target.value;
        const cents = parseMoney(event.target.value);
        line.unitCost = cents ?? -1;
      }
      updateTotal();
    });
    box.addEventListener('click', (event) => {
      const button = event.target.closest('[data-remove]');
      if (!button) return;
      lines.splice(Number(button.dataset.remove), 1);
      renderLines();
    });
    renderLines();

    onSubmit(form, async ({ note }) => {
      for (const line of lines) {
        if (!(line.qty > 0)) throw new UserError(`Escribe cuánto te entregó de "${line.name}".`);
        if (!(line.unitCost >= 0)) throw new UserError(`Revisa el costo de "${line.name}".`);
      }
      const purchase = await registerPurchase(supplier.id, lines, note);
      close();
      toast(`Compra guardada · ${money(purchase.total)}`);
      onDone();
    });
  });
}

function purchaseDetail(purchase) {
  openModal(html`
    <div class="modal-body">
      <h2>Compra a ${purchase.supplierName}</h2>
      <p class="muted">${dateTime(purchase.date)}${purchase.note && ` · ${purchase.note}`}</p>
      <ul class="plain-list">
        ${purchase.lines.map((l) => html`
          <li><span>${formatQty(l.qty)} ${unitLabel(l.unit)} · ${l.name}<br><small class="muted">${money(l.unitCost)} c/u</small></span><span class="mono">${money(l.total)}</span></li>
        `)}
      </ul>
      <div class="sum sum-total"><span>Total</span><span>${money(purchase.total)}</span></div>
      <div class="modal-actions"><button class="btn" data-close>Cerrar</button></div>
    </div>
  `);
}

async function loadList() {
  const [suppliers, purchases] = await Promise.all([listSuppliers(), allPurchases()]);
  if (!isView('proveedores')) return;
  const since = monthStart();
  const monthTotal = sum(purchases.filter((p) => p.date >= since));
  const mine = new Set(suppliers.map((s) => normalize(s.name)));
  const common = COMMON_SUPPLIERS.filter((c) => !mine.has(normalize(c.name)));

  setHTML(root.querySelector('#content'), html`
    <section class="hero-card">
      <small>Compraste este mes</small>
      <p class="hero-amount">${money(monthTotal)}</p>
      <p class="muted hero-sub">${purchases.filter((p) => p.date >= since).length} compras a ${suppliers.length} ${suppliers.length === 1 ? 'proveedor' : 'proveedores'}</p>
    </section>
    <section>
      <p class="group-title">TUS PROVEEDORES</p>
      <div class="group">
        ${suppliers.length ? suppliers.map((s) => {
          const own = purchases.filter((p) => p.supplierId === s.id);
          const month = sum(own.filter((p) => p.date >= since));
          return html`
            <a class="row row-btn" href="#proveedor/${s.id}">
              ${monogram(s.name)}
              <span class="row-main"><span class="row-title">${s.name}</span><small>${s.visitDays ? `Pasa ${s.visitDays}` : `${own.length} ${own.length === 1 ? 'compra' : 'compras'}`}</small></span>
              <span class="row-end"><strong class="row-qty">${money(month)}</strong><small class="muted">este mes</small></span>
              ${chevron}
            </a>
          `;
        }) : html`<p class="row muted">Agrega a los proveedores que te surten. Abajo tienes los más comunes.</p>`}
        <button type="button" class="row row-btn link-row" id="add-supplier"><span class="plus-dot" aria-hidden="true">+</span> Agregar otro proveedor</button>
      </div>
    </section>
    ${common.length > 0 && html`
      <section>
        <p class="group-title">PROVEEDORES COMUNES · TOCA PARA AGREGAR</p>
        <div class="group">
          ${common.map((c) => html`
            <button type="button" class="row row-btn" data-common="${c.name}">
              ${monogram(c.name)}
              <span class="row-main"><span class="row-title">${c.name}</span><small>${c.what}</small></span>
              <span class="plus-dot" aria-hidden="true">+</span>
            </button>
          `)}
        </div>
      </section>
    `}
  `);
}

export function renderSuppliers(container) {
  root = container;
  const rerender = () => { if (isView('proveedores')) loadList().catch(showError); };
  setHTML(root, html`
    <div class="page">
      <header class="nav-row">${backLink('#inventario', 'Inventario')}</header>
      <header><h1>Proveedores</h1></header>
      <div id="content" class="stack-gap"></div>
    </div>
  `);
  root.querySelector('#content').addEventListener('click', async (event) => {
    if (event.target.closest('#add-supplier')) { supplierForm(null, rerender); return; }
    const common = event.target.closest('[data-common]');
    if (!common) return;
    const info = COMMON_SUPPLIERS.find((c) => c.name === common.dataset.common);
    try {
      await saveSupplier({ name: info.name, notes: info.what });
      toast(`${info.name} agregado`);
      rerender();
    } catch (error) { showError(error); }
  });
  rerender();
}

async function loadSupplier(id) {
  const supplier = await getSupplier(id);
  if (!supplier) { location.hash = '#proveedores'; return; }
  const purchases = await purchasesOf(id);
  if (!isView('proveedor')) return;
  const since = monthStart();
  const reload = () => { if (isView('proveedor')) loadSupplier(id).catch(showError); };

  // Lo que más le compras a este proveedor (por dinero).
  const byProduct = new Map();
  purchases.forEach((p) => p.lines.forEach((l) => {
    const item = byProduct.get(l.productId) || { name: l.name, unit: l.unit, qty: 0, total: 0 };
    item.qty += l.qty;
    item.total += l.total;
    byProduct.set(l.productId, item);
  }));
  const top = [...byProduct.values()].sort((a, b) => b.total - a.total).slice(0, 8);

  setHTML(root.querySelector('#detail'), html`
    <header class="supplier-head">
      ${monogram(supplier.name, 'mono-xl')}
      <h1>${supplier.name}</h1>
      <p class="muted">${[supplier.visitDays && `Pasa ${supplier.visitDays}`, supplier.notes].filter(Boolean).join(' · ') || 'Sin notas'}</p>
      ${supplier.phone && html`<a class="link" href="tel:${supplier.phone}">Llamar · ${supplier.phone}</a>`}
    </header>
    <div class="triple">
      <div><small>Este mes</small><strong>${money(sum(purchases.filter((p) => p.date >= since)))}</strong></div>
      <div><small>Total</small><strong>${money(sum(purchases))}</strong></div>
      <div><small>Compras</small><strong>${purchases.length}</strong></div>
    </div>
    <button class="btn btn-primary btn-pill" id="new-purchase">Registrar compra</button>
    ${top.length > 0 && html`
      <section>
        <p class="group-title">LO QUE LE COMPRAS</p>
        <div class="group">
          ${top.map((t) => html`
            <div class="row">
              <span class="row-main"><span class="row-title">${t.name}</span><small>${formatQty(t.qty)} ${unitLabel(t.unit)} en total</small></span>
              <strong class="tabular">${money(t.total)}</strong>
            </div>
          `)}
        </div>
      </section>
    `}
    <section>
      <p class="group-title">COMPRAS</p>
      <div class="group">
        ${purchases.length ? purchases.map((p) => html`
          <button type="button" class="row row-btn" data-purchase="${p.id}">
            <span class="row-main"><span class="row-title">${dateTime(p.date)}</span><small>${p.lines.length} ${p.lines.length === 1 ? 'producto' : 'productos'}${p.note && ` · ${p.note}`}</small></span>
            <strong class="tabular">${money(p.total)}</strong>
            ${chevron}
          </button>
        `) : html`<p class="row muted">Todavía no le has registrado compras.</p>`}
      </div>
    </section>
  `);
  root.querySelector('#new-purchase').addEventListener('click', () => {
    if (!state.products.length) { toast('Primero agrega productos a tu inventario', 'error'); return; }
    purchaseSheet(supplier, reload);
  });
  root.querySelector('#edit-supplier').onclick = () => supplierForm(supplier, reload);
  root.querySelector('#detail').onclick = (event) => {
    const row = event.target.closest('[data-purchase]');
    if (row) purchaseDetail(purchases.find((p) => p.id === row.dataset.purchase));
  };
}

export function renderSupplier(container, id) {
  root = container;
  setHTML(root, html`
    <div class="page">
      <header class="nav-row">${backLink('#proveedores', 'Proveedores')}<button class="link" id="edit-supplier">Editar</button></header>
      <div id="detail" class="stack-gap"></div>
    </div>
  `);
  loadSupplier(id).catch(showError);
}
