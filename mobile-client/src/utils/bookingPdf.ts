import { Asset } from 'expo-asset';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { PAYMENT_CURRENCY } from '@/constants/config';

const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const money = (value: unknown, language: string, currency = PAYMENT_CURRENCY) => new Intl.NumberFormat(language, {
  style: 'currency',
  currency,
}).format(Number(value) || 0);

const getLogoDataUri = async () => {
  const logo = Asset.fromModule(require('../../assets/icon.png'));
  await logo.downloadAsync();
  if (!logo.localUri) return '';
  const base64 = await new File(logo.localUri).base64();
  return `data:image/png;base64,${base64}`;
};

type Translator = (key: string, options?: Record<string, unknown>) => string;

export const buildBookingReceiptHtml = async (booking: any, t: Translator, language = 'es') => {
  const logo = await getLogoDataUri();
  const currency = booking.currency || PAYMENT_CURRENCY;
  const professionalName = booking.professional?.user?.name || [
    booking.professional?.user?.firstName,
    booking.professional?.user?.lastName,
  ].filter(Boolean).join(' ') || t('common.professional');
  const date = new Date(booking.scheduledDate).toLocaleDateString(language, {
    day: '2-digit', month: 'long', year: 'numeric',
  });
  const address = [booking.address, booking.city, booking.state, booking.postalCode]
    .filter(Boolean).join(', ');
  const statusKey: Record<string, string> = {
    PENDING: 'pending', CONFIRMED: 'confirmed', IN_PROGRESS: 'inProgress',
    COMPLETED: 'completed', CANCELLED: 'cancelled',
  };
  const status = t(`booking.${statusKey[booking.status] ?? 'pending'}`, {
    defaultValue: booking.status,
  });
  const services = (booking.bookingServices ?? []).map((item: any) => `
    <tr>
      <td><strong>${escapeHtml(item.service?.name)}</strong><span>${escapeHtml(item.service?.description || '')}</span></td>
      <td class="center">${escapeHtml(item.quantity)}</td>
      <td class="right">${escapeHtml(money(item.subtotal ?? item.price, language, currency))}</td>
    </tr>`).join('');

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #111827; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; background: #fff; }
    .page { min-height: 1122px; padding: 54px 58px 46px; position: relative; }
    .accent { position: absolute; inset: 0 0 auto; height: 10px; background: #2563eb; }
    header { display: flex; align-items: center; justify-content: space-between; padding-bottom: 28px; border-bottom: 1px solid #e5e7eb; }
    .brand { display: flex; align-items: center; gap: 16px; }
    .logo { width: 66px; height: 66px; border-radius: 16px; object-fit: cover; }
    h1 { margin: 0; font-size: 25px; letter-spacing: -.4px; } .brand p { margin: 5px 0 0; color: #6b7280; font-size: 13px; }
    .status { color: #047857; background: #d1fae5; border-radius: 999px; padding: 8px 13px; font-size: 12px; font-weight: 700; text-transform: uppercase; }
    .reference { margin: 30px 0 24px; padding: 20px 22px; border-radius: 14px; background: #eff6ff; display: flex; justify-content: space-between; align-items: center; }
    .reference small, .label { display: block; color: #6b7280; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .8px; }
    .reference strong { display: block; color: #1d4ed8; font-size: 13px; margin-top: 5px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 28px; }
    .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px 18px; min-height: 76px; }
    .value { display: block; margin-top: 7px; font-size: 14px; font-weight: 600; line-height: 1.35; }
    h2 { font-size: 16px; margin: 0 0 12px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    th { color: #6b7280; background: #f9fafb; font-size: 10px; text-transform: uppercase; letter-spacing: .7px; text-align: left; padding: 11px 12px; }
    td { border-bottom: 1px solid #e5e7eb; padding: 14px 12px; font-size: 13px; vertical-align: top; }
    td span { display: block; color: #6b7280; font-size: 11px; margin-top: 4px; } .center { text-align: center; } .right { text-align: right; }
    .summary { width: 310px; margin-left: auto; border-radius: 12px; background: #f9fafb; padding: 16px 18px; }
    .row { display: flex; justify-content: space-between; padding: 6px 0; color: #4b5563; font-size: 13px; }
    .row.total { margin-top: 8px; padding-top: 13px; border-top: 1px solid #d1d5db; color: #111827; font-size: 18px; font-weight: 800; }
    .notes { margin-top: 26px; padding: 16px 18px; border-left: 4px solid #2563eb; background: #f9fafb; font-size: 12px; line-height: 1.5; color: #4b5563; }
    footer { position: absolute; left: 58px; right: 58px; bottom: 35px; padding-top: 15px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; color: #9ca3af; font-size: 9px; }
  </style></head><body><main class="page"><div class="accent"></div>
    <header><div class="brand">${logo ? `<img class="logo" src="${logo}">` : ''}<div><h1>${escapeHtml(t('booking.pdfTitle'))}</h1><p>ProApp Global Services</p></div></div><div class="status">${escapeHtml(status)}</div></header>
    <section class="reference"><div><small>${escapeHtml(t('booking.pdfReference'))}</small><strong>${escapeHtml(booking.id)}</strong></div><div><small>${escapeHtml(t('booking.pdfIssued'))}</small><strong>${escapeHtml(new Date().toLocaleDateString(language))}</strong></div></section>
    <section class="grid">
      <div class="card"><span class="label">${escapeHtml(t('common.professional'))}</span><span class="value">${escapeHtml(professionalName)}</span></div>
      <div class="card"><span class="label">${escapeHtml(t('common.dateTime'))}</span><span class="value">${escapeHtml(date)}${booking.scheduledTime ? ` - ${escapeHtml(booking.scheduledTime)}` : ''}</span></div>
      <div class="card" style="grid-column:1/-1"><span class="label">${escapeHtml(t('common.location'))}</span><span class="value">${escapeHtml(address)}</span></div>
    </section>
    <h2>${escapeHtml(t('common.services'))}</h2><table><thead><tr><th>${escapeHtml(t('common.services'))}</th><th class="center">${escapeHtml(t('common.quantity'))}</th><th class="right">${escapeHtml(t('booking.subtotal'))}</th></tr></thead><tbody>${services}</tbody></table>
    <section class="summary"><div class="row"><span>${escapeHtml(t('booking.subtotal'))}</span><strong>${escapeHtml(money((Number(booking.totalPrice) || 0) - (Number(booking.platformFee) || 0), language, currency))}</strong></div><div class="row"><span>${escapeHtml(t('booking.platformFee'))}</span><strong>${escapeHtml(money(booking.platformFee, language, currency))}</strong></div><div class="row total"><span>${escapeHtml(t('booking.totalPaid'))}</span><span>${escapeHtml(money(booking.totalPrice, language, currency))}</span></div></section>
    ${booking.notes ? `<section class="notes"><span class="label">${escapeHtml(t('common.notes'))}</span><div style="margin-top:7px">${escapeHtml(booking.notes)}</div></section>` : ''}
    <footer><span>${escapeHtml(t('booking.pdfFooter'))}</span><span>ProApp Global Services</span></footer>
  </main></body></html>`;

  return html;
};

export const shareBookingPdf = async (booking: any, t: Translator, language = 'es') => {
  const html = await buildBookingReceiptHtml(booking, t, language);
  const { uri } = await Print.printToFileAsync({ html });
  const shortReference = String(booking.id).split('-')[0] || 'reserva';
  const sourceFile = new File(uri);
  const shareFile = new File(Paths.cache, `comprobante-reserva-${shortReference}.pdf`);
  if (shareFile.exists) shareFile.delete();
  await sourceFile.move(shareFile, { overwrite: true });
  if (!await Sharing.isAvailableAsync()) throw new Error('Sharing is not available');
  await Sharing.shareAsync(shareFile.uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: t('booking.shareTitle'),
  });
};
