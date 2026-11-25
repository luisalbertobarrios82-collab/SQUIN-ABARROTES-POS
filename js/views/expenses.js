import { html, parseMoney } from '../core.js';
import { deleteExpense, expensesBetween, registerExpense, state, UserError } from '../services.js';
import { backLink, chevron, confirmDialog, dateTime, isView, money, onSubmit, openModal, setHTML, showError, toast } from '../ui.js';

let root;

const icon = (path) => html`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;

// Servicios y gastos típicos de una tiendita.
export const EXPENSE_TYPES = [
  { key: 'luz', label: 'Luz', color: '#E6A100', path: html`<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/>` },
  { key: 'agua', label: 'Agua', color: '#0E9FB8', path: html`<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>` },
  { key: 'gas', label: 'Gas', color: '#E8590C', path: html`<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4 2.5-5 .3 2 1.2 3 2.5 3 0-3-1-5.5 0-8z"/>` },
  { key: 'telefono', label: 'Teléfono', color: '#0071E3', path: html`<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>` },
  { key: 'internet', label: 'Internet', color: '#5856D6', path: html`<path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19.5" r="1"/>` },
  { key: 'renta', label: 'Renta del local', color: '#D9480F', path: html`<path d="M4 10h16M5 10V20h14V10M3 10l2-6h14l2 6M10 20v-5h4v5"/>` },
  { key: 'transporte', label: 'Transporte', color: '#9C36B5', path: html`<path d="M3 6h11v10H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/>` },
  { key: 'empleado', label: 'Sueldo del empleado', color: '#2B8A3E', path: html`<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>` },
  { key: 'dueno', label: 'Sueldo del dueño', color: '#1C7C54', path: html`<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0M16 3l1.5 1.5L20 2"/>` },
  { key: 'insumos', label: 'Bolsas y limpieza', color: '#6C6C70', path: html`<path d="M14 3l7 7M17 6l-9 9M8 15l-4 6 6-4M12 11l3 3"/>` },
  { key: 'otros', label: 'Otro gasto', color: '#48484A', path: html`<circle cx="6" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18" cy="12" r="1.5"/>` },
];
const typeOf = (key) => EXPENSE_TYPES.find((t) => t.key === key) || EXPENSE_TYPES[EXPENSE_TYPES.length - 1];
const badge = (type, size = '') => html`<span class="expense-icon ${size}" style="color:${type.color};background:${type.color}1A">${icon(type.path)}</span>`;

const monthRange = () => {
  const d = new Date();
  return [new Date(d.getFullYear(), d.getMonth(), 1).toISOString(), new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999).toISOString()];
};

function expenseForm(type, onDone) {
  const shiftOpen = Boolean(state.shift);
  openModal(html`
    <form class="modal-body">
      <div class="expense-form-head">${badge(type, 'big')}<h2>${type.key === 'otros' ? 'Otro gasto' : `Pago de ${type.label.toLowerCase()}`}</h2></div>
      ${type.key === 'otros' && html`<label class="field">¿Qué pagaste? <input name="label" required maxlength="60" placeholder="Ej. Reparación del refrigerador" autocomplete="off"></label>`}
      <label class="field">¿Cuánto pagaste? <input name="amount" inputmode="decimal" required placeholder="$0" autocomplete="off" autofocus></label>
      <fieldset class="field source-field">
        <legend>¿Con qué dinero se pagó?</legend>
        <div class="segmented">
          <label><input type="radio" name="source" value="cash" ${shiftOpen ? html`checked` : ''}><span>Dinero de la caja</span></label>
          <label><input type="radio" name="source" value="external" ${shiftOpen ? '' : html`checked`}><span>Dinero externo</span></label>
        </div>
        <p class="hint" data-source-hint></p>
      </fieldset>
      <label class="field">Nota <input name="note" maxlength="120" placeholder="Opcional, ej. recibo de noviembre" autocomplete="off"></label>
      <div class="modal-actions">
        <button type="button" class="btn" data-close>Cancelar</button>
        <button class="btn btn-primary">Guardar pago</button>
      </div>
    </form>
  `, (dialog, close) => {
    const form = dialog.querySelector('form');
    const hint = dialog.querySelector('[data-source-hint]');
    const explain = () => {
      const cash = form.elements.source.value === 'cash';
      hint.textContent = cash
        ? (shiftOpen ? 'Sale del efectivo de la caja: aparece como salida en el corte de hoy.' : 'La caja está cerrada. Ábrela para pagar con su dinero o elige "Dinero externo".')
        : 'Lo pagó el dueño con su dinero: no toca el efectivo de la caja, solo queda registrado como gasto.';
    };
    form.addEventListener('change', explain);
    explain();
    onSubmit(form, async ({ amount, source, note, label }) => {
      const cents = parseMoney(amount);
      if (!cents) throw new UserError('Escribe cuánto pagaste.');
      const name = type.key === 'otros' ? (label || '').trim() : type.label;
      if (!name) throw new UserError('Escribe qué pagaste.');
      await registerExpense({ category: type.key, label: name, amount: cents, source, note });
      close();
      toast(source === 'cash' ? `Pago guardado · salió ${money(cents)} de la caja` : 'Pago guardado');
      onDone();
    });
  });
}

function expenseDetail(expense, onDone) {
  const type = typeOf(expense.category);
  openModal(html`
    <div class="modal-body">
      <div class="expense-form-head">${badge(type, 'big')}<h2>${expense.label}</h2></div>
      <p class="hero-amount">${money(expense.amount)}</p>
      <p class="muted">${dateTime(expense.date)} · ${expense.source === 'cash' ? 'Dinero de la caja' : 'Dinero externo'}${expense.note && ` · ${expense.note}`}</p>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost-danger" data-delete>Borrar</button>
        <button type="button" class="btn" data-close>Cerrar</button>
      </div>
    </div>
  `, (dialog, close) => {
    dialog.querySelector('[data-delete]').addEventListener('click', async () => {
      const message = expense.source === 'cash' ? 'El dinero regresará al conteo de la caja.' : 'Se quitará de tus gastos.';
      const ok = await confirmDialog({ title: 'Borrar pago', message, action: 'Borrar', danger: true });
      if (!ok) return;
      try {
        await deleteExpense(expense.id);
        close();
        toast('Pago borrado');
        onDone();
      } catch (error) { showError(error); }
    });
  });
}

async function load() {
  const [from, to] = monthRange();
  const expenses = await expensesBetween(from, to);
  if (!isView('gastos')) return;
  const total = expenses.reduce((a, e) => a + e.amount, 0);
  const fromCash = expenses.filter((e) => e.source === 'cash').reduce((a, e) => a + e.amount, 0);
  const month = new Date().toLocaleDateString('es-MX', { month: 'long' });
  const reload = () => { if (isView('gastos')) load().catch(showError); };

  setHTML(root.querySelector('#content'), html`
    <section class="hero-card">
      <small>Gastos de ${month}</small>
      <p class="hero-amount">${money(total)}</p>
      <div class="legend">
        <div><span><i class="s-cash"></i>De la caja</span><strong>${money(fromCash)}</strong></div>
        <div><span><i class="s-ext"></i>Dinero externo</span><strong>${money(total - fromCash)}</strong></div>
      </div>
    </section>
    <section>
      <p class="group-title">¿QUÉ PAGASTE?</p>
      <div class="expense-grid">
        ${EXPENSE_TYPES.map((t) => html`
          <button type="button" class="expense-tile" data-type="${t.key}">${badge(t)}<span>${t.label}</span></button>
        `)}
      </div>
    </section>
    <section>
      <p class="group-title">PAGOS DE ${month.toUpperCase()}</p>
      <div class="group">
        ${expenses.length ? expenses.map((e) => html`
          <button type="button" class="row row-btn" data-expense="${e.id}">
            ${badge(typeOf(e.category))}
            <span class="row-main"><span class="row-title">${e.label}</span><small>${dateTime(e.date)} · ${e.source === 'cash' ? 'De la caja' : 'Externo'}</small></span>
            <strong class="tabular">${money(e.amount)}</strong>
            ${chevron}
          </button>
        `) : html`<p class="row muted">Aún no registras pagos este mes. Toca arriba lo que pagaste.</p>`}
      </div>
    </section>
  `);
  root.querySelector('#content').onclick = (event) => {
    const tile = event.target.closest('[data-type]');
    if (tile) { expenseForm(typeOf(tile.dataset.type), reload); return; }
    const row = event.target.closest('[data-expense]');
    if (row) expenseDetail(expenses.find((e) => e.id === row.dataset.expense), reload);
  };
}

export function renderExpenses(container) {
  root = container;
  setHTML(root, html`
    <div class="page">
      <header class="nav-row">${backLink('#corte', 'Corte')}</header>
      <header><h1>Gastos y servicios</h1><p class="muted">Luz, agua, renta, sueldos y lo que pague la tienda.</p></header>
      <div id="content" class="stack-gap"></div>
    </div>
  `);
  load().catch(showError);
}
