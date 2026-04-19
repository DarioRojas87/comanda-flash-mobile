/**
 * PDF generation utilities for ComandaFlash.
 *
 * Uses expo-print to render HTML → PDF, then expo-sharing to let the
 * user share/save the file. This replaces the PWA's jsPDF + autoTable.
 */
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';

// ── Types ─────────────────────────────────────────────────────────

interface OrderRow {
  id: string;
  customer_name: string;
  address_text: string | null;
  total_amount: number | null;
  is_paid: boolean;
  status: string;
  delivery_id: string | null;
  created_at: string | null;
}

interface ProfileRow {
  id: string;
  full_name: string;
}

interface CashSummary {
  totalSales: number;
  totalLosses: number;
}

// ── Shared Styles ─────────────────────────────────────────────────

const baseStyles = `
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; padding: 32px; }
    h1 { font-size: 22px; font-weight: 900; color: #0f172a; }
    h2 { font-size: 14px; font-weight: 700; color: #334155; margin-top: 24px; margin-bottom: 8px; }
    .subtitle { font-size: 11px; color: #64748b; margin-top: 4px; }
    .meta { font-size: 10px; color: #94a3b8; margin-top: 2px; }
    .summary-row { display: flex; justify-content: space-between; padding: 10px 14px; border-radius: 10px; margin-bottom: 6px; }
    .summary-row.green { background: #f0fdf4; border: 1px solid #bbf7d0; }
    .summary-row.red { background: #fef2f2; border: 1px solid #fecaca; }
    .summary-row .label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
    .summary-row .value { font-size: 18px; font-weight: 900; }
    .summary-row.green .label, .summary-row.green .value { color: #16a34a; }
    .summary-row.red .label, .summary-row.red .value { color: #dc2626; }
    .net { display: flex; justify-content: space-between; align-items: flex-end; padding: 12px 0; margin-top: 8px; border-top: 2px dashed #e2e8f0; }
    .net .label { font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; }
    .net .value { font-size: 28px; font-weight: 900; color: #0f172a; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; margin-bottom: 16px; }
    th { background: #f97316; color: white; padding: 8px 10px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
    th:first-child { border-radius: 8px 0 0 0; }
    th:last-child { border-radius: 0 8px 0 0; }
    td { padding: 7px 10px; font-size: 10px; border-bottom: 1px solid #f1f5f9; color: #334155; }
    tr:last-child td { border-bottom: none; }
    .subtotal-row td { font-weight: 700; background: #fff7ed; border-top: 2px solid #fed7aa; color: #c2410c; }
    .failed-table th { background: #ef4444; }
    .blue-table th { background: #3b82f6; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 9px; font-weight: 700; }
    .badge.paid { background: #dcfce7; color: #16a34a; }
    .badge.unpaid { background: #fef2f2; color: #dc2626; }
    .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 9px; color: #94a3b8; text-align: center; }
  </style>
`;

// ── Daily Cash Close PDF ──────────────────────────────────────────

export const generateCashClosePDF = async (
  orders: OrderRow[],
  profiles: ProfileRow[],
  summary: CashSummary,
): Promise<void> => {
  const today = new Date().toLocaleDateString('es-AR');
  const time = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

  const deliveredOrders = orders.filter((o) => o.status === 'delivered');
  const failedOrders = orders.filter((o) => o.status === 'failed' || o.status === 'cancelled');

  // Group delivered orders by delivery driver
  const deliveryGroups: Record<string, { name: string; orders: OrderRow[] }> = {};
  for (const o of deliveredOrders) {
    const key = o.delivery_id ?? 'sin-asignar';
    const profile = profiles.find((p) => p.id === key);
    const name = profile?.full_name ?? 'Sin asignar';
    if (!deliveryGroups[key]) deliveryGroups[key] = { name, orders: [] };
    deliveryGroups[key].orders.push(o);
  }

  // Build delivery group tables
  let groupsHTML = '';
  for (const { name, orders: groupOrders } of Object.values(deliveryGroups)) {
    const subtotal = groupOrders.reduce((a, o) => a + (o.total_amount || 0), 0);
    groupsHTML += `
      <h2>🛵 Repartidor: ${name} — Subtotal: $${subtotal.toFixed(2)}</h2>
      <table>
        <thead>
          <tr><th>Cliente</th><th>Dirección</th><th>Monto</th><th>Pagado</th></tr>
        </thead>
        <tbody>
          ${groupOrders
            .map(
              (o) => `
            <tr>
              <td>${o.customer_name}</td>
              <td>${o.address_text ?? '-'}</td>
              <td>$${(o.total_amount ?? 0).toFixed(2)}</td>
              <td><span class="badge ${o.is_paid ? 'paid' : 'unpaid'}">${o.is_paid ? 'Sí' : 'No'}</span></td>
            </tr>`,
            )
            .join('')}
          <tr class="subtotal-row">
            <td colspan="2">SUBTOTAL</td>
            <td>$${subtotal.toFixed(2)}</td>
            <td></td>
          </tr>
        </tbody>
      </table>
    `;
  }

  // Failed orders table
  let failedHTML = '';
  if (failedOrders.length > 0) {
    failedHTML = `
      <h2>❌ Pedidos Cancelados / Fallidos — Pérdidas: $${summary.totalLosses.toFixed(2)}</h2>
      <table class="failed-table">
        <thead>
          <tr><th>Cliente</th><th>Dirección</th><th>Monto</th><th>Estado</th></tr>
        </thead>
        <tbody>
          ${failedOrders
            .map(
              (o) => `
            <tr>
              <td>${o.customer_name}</td>
              <td>${o.address_text ?? '-'}</td>
              <td>$${(o.total_amount ?? 0).toFixed(2)}</td>
              <td>${o.status === 'cancelled' ? 'Cancelado' : 'Fallido'}</td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    `;
  }

  const html = `
    <html>
    <head>${baseStyles}</head>
    <body>
      <h1>⚡ ComandaFlash — Resumen de Caja</h1>
      <p class="subtitle">Fecha: ${today}</p>
      <p class="meta">Turno hasta las ${time}</p>

      <div style="margin-top: 20px;">
        <div class="summary-row green">
          <div>
            <div class="label">Venta Bruta</div>
          </div>
          <div class="value">$${summary.totalSales.toFixed(2)}</div>
        </div>
        <div class="summary-row red">
          <div>
            <div class="label">Pérdidas</div>
          </div>
          <div class="value">-$${summary.totalLosses.toFixed(2)}</div>
        </div>
        <div class="net">
          <span class="label">Balance Neto</span>
          <span class="value">$${(summary.totalSales - summary.totalLosses).toFixed(2)}</span>
        </div>
      </div>

      ${groupsHTML}
      ${failedHTML}

      <div class="footer">
        ComandaFlash &mdash; Generado el ${today} a las ${time}
      </div>
    </body>
    </html>
  `;

  try {
    const { uri } = await Print.printToFileAsync({ html });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: `Cierre de Caja — ${today}`,
        UTI: 'com.adobe.pdf',
      });
    } else {
      Alert.alert('PDF generado', `Archivo guardado en: ${uri}`);
    }
  } catch (err) {
    Alert.alert('Error', 'No se pudo generar el PDF.');
  }
};

// ── 7-Day History PDF ─────────────────────────────────────────────

export const generate7DayPDF = async (weekOrders: OrderRow[]): Promise<void> => {
  const from = new Date();
  from.setDate(from.getDate() - 7);
  const fromStr = from.toLocaleDateString('es-AR');
  const toStr = new Date().toLocaleDateString('es-AR');
  const total = weekOrders.reduce((a, o) => a + (o.total_amount ?? 0), 0);

  const html = `
    <html>
    <head>${baseStyles}</head>
    <body>
      <h1>⚡ ComandaFlash — Historial 7 Días</h1>
      <p class="subtitle">Período: ${fromStr} al ${toStr}</p>
      <p class="meta">Total entregado: $${total.toFixed(2)} &mdash; Pedidos: ${weekOrders.length}</p>

      <table class="blue-table" style="margin-top: 20px;">
        <thead>
          <tr><th>Fecha</th><th>Cliente</th><th>Dirección</th><th>Monto</th></tr>
        </thead>
        <tbody>
          ${weekOrders
            .map(
              (o) => `
            <tr>
              <td>${new Date(o.created_at ?? '').toLocaleDateString('es-AR')}</td>
              <td>${o.customer_name}</td>
              <td>${o.address_text ?? '-'}</td>
              <td>$${(o.total_amount ?? 0).toFixed(2)}</td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>

      <div class="net" style="margin-top: 8px;">
        <span class="label">Total General</span>
        <span class="value">$${total.toFixed(2)}</span>
      </div>

      <div class="footer">
        ComandaFlash &mdash; Generado el ${toStr}
      </div>
    </body>
    </html>
  `;

  try {
    const { uri } = await Print.printToFileAsync({ html });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: `Historial 7 Días — ${toStr}`,
        UTI: 'com.adobe.pdf',
      });
    } else {
      Alert.alert('PDF generado', `Archivo guardado en: ${uri}`);
    }
  } catch (err) {
    Alert.alert('Error', 'No se pudo generar el PDF.');
  }
};
