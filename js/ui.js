// Utilidades de interfaz: hojas modales, avisos, ticket y descargas.
import { centsToInput, computeMargin, formatMoney, formatPercent, formatQty, html, initials, MINISUPER_CATEGORIES, parseMoney, tintIndex, unitCostFromPack } from './core.js';
import { openShift, state, UserError } from './services.js';

export const money = (cents) => formatMoney(cents, state.settings.currency);
export const moneyFull = (cents) => formatMoney(cents, state.settings.currency, { full: true });

// Lista de categorías: las típicas, las que ya usa la tienda y una opción para escribir otra.
const OTHER_CATEGORY = '__otra';

export function categoryFieldHtml(current = '') {
  const names = [...new Set([...MINISUPER_CATEGORIES, ...state.products.map((p) => p.category), ...(current ? [current] : [])])]
    .sort((a, b) => a.localeCompare(b, 'es'));
  return html`
    <label class="field">Categoría
      <select name="categoryChoice">
        <option value="">Elige una</option>
        ${names.map((name) => html`<option value="${name}" ${name === current ? html`selected` : ''}>${name}</option>`)}
        <option value="${OTHER_CATEGORY}">Otra…</option>
      </select>
    </label>
    <label class="field" data-category-other hidden>Escribe la categoría
      <input name="category" maxlength="40" autocomplete="off">
    </label>
  `;
}

export function bindCategoryField(form) {
  const other = form.querySelector('[data-category-other]');
  form.elements.categoryChoice.addEventListener('change', (event) => {
    other.hidden = event.target.value !== OTHER_CATEGORY;
    if (!other.hidden) form.elements.category.focus();
  });
}

export const readCategory = (values) => (values.categoryChoice === OTHER_CATEGORY
  ? values.category.trim()
  : values.categoryChoice) || 'General';

// Texto corto de ganancia por unidad, por ejemplo "+$0.90 · margen 30%".
export function marginShort(price, cost) {
  const { profit, margin } = computeMargin(price, cost);
  return `${profit < 0 ? '−' : '+'}${money(Math.abs(profit))}${margin === null ? '' : ` · margen ${formatPercent(margin)}`}`;
}

// Muestra la ganancia en [data-margin] mientras se escriben precio y costo.
export function bindMargin(form) {
  const box = form.querySelector('[data-margin]');
  const update = () => {
    const price = parseMoney(form.elements.price.value);
    const costText = form.elements.cost.value.trim();
    const cost = parseMoney(costText);
    const ready = price !== null && costText !== '' && cost !== null;
    const { profit, margin } = ready ? computeMargin(price, cost) : { profit: 0, margin: null };
    box.classList.toggle('is-gain', ready && profit >= 0);
    box.classList.toggle('is-loss', ready && profit < 0);
    if (!ready) {
      box.textContent = 'Escribe precio y costo para ver cuánto ganas.';
      return;
    }
    const marginText = margin === null ? '' : ` · Margen ${formatPercent(margin)}`;
    box.textContent = `${profit < 0 ? 'Pierdes' : 'Ganas'} ${money(Math.abs(profit))}${marginText}`;
  };
  form.elements.price.addEventListener('input', update);
  form.elements.cost.addEventListener('input', update);
  update();
}

export const packFieldsHtml = (packUnits = 0) => html`
  <label class="field">Piezas por caja <input name="packUnits" inputmode="numeric" value="${packUnits || ''}" autocomplete="off"></label>
  <label class="field">Costo de la caja <input name="packCost" inputmode="decimal" placeholder="Opcional" autocomplete="off"></label>
`;

// Al escribir el costo de la caja, llena el costo por pieza.
export function bindPackCost(form) {
  const update = () => {
    const cost = unitCostFromPack(parseMoney(form.elements.packCost.value), Number(form.elements.packUnits.value));
    if (cost === null) return;
    form.elements.cost.value = centsToInput(cost);
    form.elements.cost.dispatchEvent(new Event('input', { bubbles: true }));
  };
  form.elements.packCost.addEventListener('input', update);
  form.elements.packUnits.addEventListener('input', update);
}

export const METHODS = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia', credit: 'Fiado' };

export const monogram = (name, size = '') => html`<span class="mono-tile ${size} tint-${tintIndex(name)}" aria-hidden="true">${initials(name)}</span>`;
export const thumb = (product, size = '') => (product.image
  ? html`<img class="mono-tile photo ${size}" src="${product.image}" alt="" loading="lazy" data-name="${product.name}">`
  : monogram(product.name, size));

// Si una foto no carga, se muestran las iniciales.
document.addEventListener('error', (event) => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || !image.classList.contains('photo')) return;
  image.outerHTML = String(monogram(image.dataset.name, image.classList.contains('mono-xl') ? 'mono-xl' : ''));
}, true);

export const catalogCard = (found) => html`
  ${found.image && html`<img class="catalog-photo" src="${found.image}" alt="">`}
  <span>
    <strong>${found.name || 'Encontramos la foto'}</strong>
    <small>${found.name ? 'Sugerido por Open Food Facts. Revisa que sea correcto.' : 'Falta el nombre: escríbelo abajo.'}</small>
  </span>
`;

export const chevron = html`<svg class="chevron" width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m1 1 6 6-6 6"/></svg>`;
export const backLink = (href, label) => html`<a class="back" href="${href}"><svg width="10" height="18" viewBox="0 0 10 18" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M9 1 1 9l8 8"/></svg>${label}</a>`;

// Tras una espera, indica si el usuario sigue en esa pantalla.
export const isView = (name) => document.body.dataset.view === name;

export function setHTML(element, content) {
  element.innerHTML = String(content);
}

export function toast(message, kind = 'ok') {
  const box = document.getElementById('toasts');
  const item = document.createElement('div');
  item.className = `toast toast-${kind}`;
  item.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  item.textContent = message;
  box.replaceChildren(item);
  setTimeout(() => item.remove(), kind === 'error' ? 6000 : 2600);
}

export function showError(error) {
  if (error instanceof UserError) toast(error.message, 'error');
  else {
    console.error(error);
    toast(`Ocurrió un error: ${error?.message || error}`, 'error');
  }
}

// Abre un <dialog> como hoja inferior. onReady recibe (dialog, close).
// En iPhone el teclado tapa la parte de abajo de la pantalla, pero la página no se entera:
// las ventanas se quedaban debajo del teclado. Se suben justo encima de él.
// Para que no brinque: se regresa a su lugar el corrimiento que hace el iPhone por su cuenta,
// solo se mueve la ventana cuando cambia el alto del teclado, y el campo se muestra moviendo
// únicamente el contenido de la ventana (nunca la página entera).
let keyboardHeight = 0;
let fitFrame = 0;

function revealFocused(dialog) {
  const field = document.activeElement;
  if (!field || !dialog.contains(field) || field === dialog) return;
  const box = dialog.getBoundingClientRect();
  const rect = field.getBoundingClientRect();
  if (rect.bottom > box.bottom - 16) dialog.scrollTop += rect.bottom - box.bottom + 24;
  else if (rect.top < box.top + 16) dialog.scrollTop -= box.top - rect.top + 24;
}

function fitModalsToKeyboard() {
  const vv = window.visualViewport;
  const dialog = [...document.querySelectorAll('dialog.modal[open]')].pop();
  if (!vv || !dialog) return;
  // El iPhone corre la página para mostrar el campo; la ventana ya lo muestra, así que se deshace.
  if (window.scrollY || vv.offsetTop) window.scrollTo(0, 0);
  // El alto del teclado no depende de cuánto corrió el iPhone la vista.
  const keyboard = Math.max(0, Math.round(window.innerHeight - vv.height));
  if (Math.abs(keyboard - keyboardHeight) < 4) return;
  keyboardHeight = keyboard;
  document.querySelectorAll('dialog.modal[open]').forEach((open) => {
    open.style.marginBottom = keyboard ? `${keyboard}px` : '';
    open.style.maxHeight = keyboard ? `${Math.round(vv.height * 0.94)}px` : '';
  });
  if (keyboard) revealFocused(dialog);
}

function scheduleFit() {
  cancelAnimationFrame(fitFrame);
  fitFrame = requestAnimationFrame(fitModalsToKeyboard);
}
window.visualViewport?.addEventListener('resize', scheduleFit);
window.visualViewport?.addEventListener('scroll', scheduleFit);
document.addEventListener('focusin', (event) => {
  const dialog = event.target.closest?.('dialog.modal[open]');
  if (dialog && keyboardHeight) requestAnimationFrame(() => revealFocused(dialog));
});

export function openModal(content, onReady, { onClose } = {}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'modal';
  setHTML(dialog, content);
  document.body.append(dialog);
  // Los toasts deben verse por encima de la capa superior del diálogo.
  dialog.append(document.getElementById('toasts'));
  const close = () => dialog.close();
  dialog.addEventListener('close', () => {
    const parent = document.querySelector('dialog[open]') || document.body;
    parent.append(document.getElementById('toasts'));
    dialog.remove();
    onClose?.();
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog || event.target.closest('[data-close]')) close();
  });
  dialog.showModal();
  // Si el teclado ya estaba abierto, la ventana nueva nace encima de él.
  if (keyboardHeight && window.visualViewport) {
    dialog.style.marginBottom = `${keyboardHeight}px`;
    dialog.style.maxHeight = `${Math.round(window.visualViewport.height * 0.94)}px`;
  }
  scheduleFit();
  onReady?.(dialog, close);
  return { dialog, close };
}

export function confirmDialog({ title, message, action = 'Confirmar', danger = false }) {
  return new Promise((resolve) => {
    let answer = false;
    openModal(html`
      <form method="dialog" class="modal-body">
        <h2>${title}</h2>
        <p class="muted">${message}</p>
        <div class="modal-actions">
          <button type="button" class="btn" data-close>Volver</button>
          <button type="submit" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-yes>${action}</button>
        </div>
      </form>
    `, (dialog) => {
      dialog.querySelector('[data-yes]').addEventListener('click', () => { answer = true; });
    }, { onClose: () => resolve(answer) });
  });
}

// Conecta un formulario: maneja errores y evita doble envío.
export function onSubmit(form, handler) {
  let busy = false;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    try {
      await handler(Object.fromEntries(new FormData(form)));
    } catch (error) {
      showError(error);
    } finally {
      busy = false;
    }
  });
}

export function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const dateTime = (iso) => new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });

export function localDate(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export const dayStart = (value) => new Date(`${value}T00:00:00`).toISOString();
export const dayEnd = (value) => new Date(`${value}T23:59:59.999`).toISOString();

// Renglones del ticket: se usan igual para imprimir, para la vista previa y para la imagen.
function ticketLines(sale) {
  const { storeName, address, phone, taxId, ticketFooter } = state.settings;
  const lines = [{ t: 'title', text: storeName }];
  if (address) lines.push({ t: 'center', text: address });
  if (phone) lines.push({ t: 'center', text: `Tel. ${phone}` });
  if (taxId) lines.push({ t: 'center', text: `RFC ${taxId}` });
  lines.push({ t: 'hr' }, { t: 'center', text: `Ticket ${sale.folio} · ${dateTime(sale.date)}` });
  if (sale.status === 'cancelled') lines.push({ t: 'center', text: '*** VENTA CANCELADA ***', bold: true });
  lines.push({ t: 'hr' });
  sale.lines.forEach((line) => {
    lines.push({ t: 'left', text: line.name });
    lines.push({ t: 'row', l: `${formatQty(line.qty)} ${line.unit} x ${moneyFull(line.unitPrice)}`, r: moneyFull(line.gross) });
  });
  lines.push({ t: 'hr' });
  if (sale.discount > 0) lines.push({ t: 'row', l: 'Descuento', r: `-${moneyFull(sale.discount)}` });
  lines.push({ t: 'row', l: 'Subtotal', r: moneyFull(sale.net) });
  Object.entries(sale.taxByRate).forEach(([rate, amount]) => lines.push({ t: 'row', l: `IVA ${rate}%`, r: moneyFull(amount) }));
  lines.push({ t: 'row', l: 'TOTAL', r: moneyFull(sale.total), big: true });
  if (sale.method === 'credit') lines.push({ t: 'row', l: 'Fiado a', r: sale.customerName });
  else lines.push({ t: 'row', l: METHODS[sale.method], r: moneyFull(sale.received) });
  if (sale.change > 0) lines.push({ t: 'row', l: 'Cambio', r: moneyFull(sale.change) });
  if (ticketFooter) lines.push({ t: 'hr' }, { t: 'center', text: ticketFooter });
  return lines;
}

const ticketHtml = (lines) => html`
  <div class="ticket-print">
    ${lines.map((line) => {
      if (line.t === 'title') return html`<h1>${line.text}</h1>`;
      if (line.t === 'hr') return html`<hr>`;
      if (line.t === 'left') return html`<div class="tp-item">${line.text}</div>`;
      if (line.t === 'row') return html`<div class="tp-row ${line.big ? 'tp-total' : ''}"><span>${line.l}</span><span>${line.r}</span></div>`;
      return html`<p>${line.bold ? html`<strong>${line.text}</strong>` : line.text}</p>`;
    })}
  </div>
`;

// Dibuja el ticket como imagen, del ancho de un ticket de 80 mm.
function ticketImage(lines) {
  const width = 576;
  const pad = 28;
  const font = (size, bold) => `${bold ? '700 ' : ''}${size}px ui-monospace, Menlo, Consolas, monospace`;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const wrap = (text, size, bold, max) => {
    ctx.font = font(size, bold);
    const out = [];
    let current = '';
    String(text).split(' ').forEach((word) => {
      const next = current ? `${current} ${word}` : word;
      if (ctx.measureText(next).width > max && current) { out.push(current); current = word; } else current = next;
    });
    out.push(current);
    return out;
  };
  const draw = (paint) => {
    let y = pad;
    lines.forEach((line) => {
      if (line.t === 'hr') {
        if (paint) { ctx.setLineDash([8, 6]); ctx.beginPath(); ctx.moveTo(pad, y + 10); ctx.lineTo(width - pad, y + 10); ctx.stroke(); }
        y += 22;
        return;
      }
      const size = line.t === 'title' ? 32 : line.big ? 28 : 22;
      const bold = line.t === 'title' || line.big || line.bold;
      const step = Math.round(size * 1.4);
      if (line.t === 'row') {
        if (paint) {
          ctx.font = font(size, bold);
          ctx.textAlign = 'left'; ctx.fillText(line.l, pad, y + size);
          ctx.textAlign = 'right'; ctx.fillText(line.r, width - pad, y + size);
        }
        y += step;
        return;
      }
      wrap(line.text, size, bold, width - pad * 2).forEach((part) => {
        if (paint) {
          ctx.font = font(size, bold);
          ctx.textAlign = line.t === 'left' ? 'left' : 'center';
          ctx.fillText(part, line.t === 'left' ? pad : width / 2, y + size);
        }
        y += step;
      });
    });
    return y + pad;
  };
  canvas.width = width;
  canvas.height = draw(false);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000';
  ctx.strokeStyle = '#000';
  draw(true);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

async function shareTicket(sale, lines) {
  const blob = await ticketImage(lines);
  const file = new File([blob], `ticket-${sale.folio}.png`, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `Ticket ${sale.folio}` });
    } catch (error) {
      if (error.name !== 'AbortError') throw error;
    }
    return;
  }
  // Computadoras sin menú de compartir: se descarga la imagen.
  download(file.name, blob, 'image/png');
  toast('Se descargó la imagen del ticket');
}

// El botón de imprimir del navegador no funciona en todos los teléfonos (por ejemplo, en el iPhone
// con la app en la pantalla de inicio, o sin impresora AirPrint). Por eso se muestra el ticket y se
// ofrece compartirlo como imagen: desde ahí se manda por WhatsApp o se usa "Imprimir" del teléfono.
export function printTicket(sale) {
  const lines = ticketLines(sale);
  setHTML(document.getElementById('print-area'), ticketHtml(lines));
  openModal(html`
    <div class="modal-body">
      <h2>Ticket ${sale.folio}</h2>
      <div class="ticket-preview">${ticketHtml(lines)}</div>
      <button type="button" class="btn btn-primary btn-pill" data-share>Compartir o imprimir</button>
      <button type="button" class="btn btn-plain" data-print-now>Imprimir directo</button>
      <button type="button" class="btn btn-plain" data-close>Cerrar</button>
    </div>
  `, (dialog) => {
    dialog.querySelector('[data-share]').addEventListener('click', () => shareTicket(sale, lines).catch(showError));
    dialog.querySelector('[data-print-now]').addEventListener('click', () => window.print());
  });
}

export function promptOpenShift(onDone) {
  openModal(html`
    <form class="modal-body">
      <h2>Abrir caja</h2>
      <p class="muted">¿Con cuánto efectivo empiezas?</p>
      <label class="field">Fondo inicial
        <input name="float" inputmode="decimal" autocomplete="off" value="0.00" required>
      </label>
      <div class="modal-actions">
        <button type="button" class="btn" data-close>Cancelar</button>
        <button class="btn btn-primary">Abrir caja</button>
      </div>
    </form>
  `, (dialog, close) => {
    dialog.querySelector('[name=float]').select();
    onSubmit(dialog.querySelector('form'), async ({ float }) => {
      const amount = parseMoney(float);
      if (amount === null) throw new UserError('Escribe un monto válido.');
      await openShift(amount);
      close();
      toast('Caja abierta');
      onDone?.();
    });
  });
}
