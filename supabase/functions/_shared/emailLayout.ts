// One email shell for every message the portal sends.
//
// Same house look as the PDFs (src/lib/pdfDocument.ts): a charcoal masthead carrying the
// wordmark and a small document label, a paper-white body on a white card, one charcoal
// button style, and a charcoal footer with the address. No gradients, no bright green;
// the only accent is a deep red, reserved for a payment-due label.
//
// Everything is table-based inline CSS because that is what mail clients render reliably.

export const EMAIL = {
  logoUrl: "https://vibepkgportal.com/images/vibe-logo-print.png",
  ink: "#232931",        // masthead, footer, buttons, headings
  body: "#464E59",       // body text
  muted: "#78808A",      // labels, secondary text
  onInkMuted: "#A8B0BB", // secondary text on the charcoal band
  rule: "#DCE0E6",       // dividers
  paper: "#FBFAF9",      // page ground behind the card
  panel: "#F5F6F8",      // detail card fill
  danger: "#B8372E",     // payment due only
  companyName: "Vibe Packaging",
  legalName: "ArmorPak Inc. DBA Vibe Packaging",
  addressLine: "1415 S 700 W · Salt Lake City, UT 84104 · www.vibepkg.com",
  font: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
};

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** A paragraph of body text. Pass already-escaped or trusted HTML. */
export function paragraph(html: string, opts: { muted?: boolean; last?: boolean } = {}): string {
  const color = opts.muted ? EMAIL.muted : EMAIL.body;
  const size = opts.muted ? 13 : 15;
  return `<p style="margin: 0 0 ${opts.last ? 0 : 16}px 0; color: ${color}; font-size: ${size}px; line-height: 1.6;">${html}</p>`;
}

/** Plain text with line breaks, escaped, as paragraphs. */
export function paragraphsFromText(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => paragraph(escapeHtml(line)))
    .join("");
}

export interface DetailRow {
  label: string;
  value: string;
  /** Larger, bold — the number the reader is looking for. */
  emphasis?: boolean;
  /** Deep red value — payment due only. */
  danger?: boolean;
  /** Monospace, for tracking numbers and SKUs. */
  mono?: boolean;
}

/** A quiet panel of label / value rows. Values must already be escaped. */
export function detailCard(rows: DetailRow[]): string {
  const cells = rows
    .map((row, i) => {
      const color = row.danger ? EMAIL.danger : EMAIL.ink;
      const size = row.emphasis ? 20 : 15;
      const weight = row.emphasis ? 700 : 500;
      const family = row.mono ? "font-family: 'SF Mono', Menlo, Consolas, monospace;" : "";
      return `
        <tr>
          <td style="padding: ${i === 0 ? 0 : 12}px 0 0 0; ${i === 0 ? "" : `border-top: 1px solid ${EMAIL.rule};`}">
            <p style="margin: ${i === 0 ? 0 : 12}px 0 0 0; color: ${EMAIL.muted}; font-size: 12px; font-weight: 600;">${escapeHtml(row.label)}</p>
            <p style="margin: 3px 0 0 0; color: ${color}; font-size: ${size}px; font-weight: ${weight}; ${family}">${row.value}</p>
          </td>
        </tr>`;
    })
    .join("");
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: ${EMAIL.panel}; border: 1px solid ${EMAIL.rule}; border-radius: 6px; margin: 0 0 24px 0;">
      <tr><td style="padding: 20px 24px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${cells}</table>
      </td></tr>
    </table>`;
}

export interface EmailButton {
  label: string;
  url: string;
  /** Outline style for a secondary action. */
  secondary?: boolean;
}

export function buttons(items: EmailButton[]): string {
  if (items.length === 0) return "";
  const cells = items
    .map((b) => {
      const style = b.secondary
        ? `background-color: #ffffff; color: ${EMAIL.ink}; border: 1px solid ${EMAIL.ink};`
        : `background-color: ${EMAIL.ink}; color: #ffffff; border: 1px solid ${EMAIL.ink};`;
      return `
        <td align="center" style="padding: 8px 6px;">
          <a href="${escapeHtml(b.url)}" style="display: inline-block; ${style} padding: 12px 24px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 600;">${escapeHtml(b.label)}</a>
        </td>`;
    })
    .join("");
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 4px auto 0 auto;">
      <tr>${cells}</tr>
    </table>`;
}

export interface RenderEmailOptions {
  /** Small label under the wordmark: INVOICE, ORDER CONFIRMATION, PURCHASE ORDER ... */
  documentLabel: string;
  /** Deep red label (payment due). */
  labelDanger?: boolean;
  /** Optional heading at the top of the body. Escaped. */
  heading?: string;
  /** Body HTML built from paragraph() / detailCard() / buttons(). */
  bodyHtml: string;
  /** Address shown in the footer's "Questions?" line. Escaped. */
  contactEmail?: string | null;
  /** Show the "do not reply" line (default true). */
  noReply?: boolean;
  /** Document <title>. */
  title?: string;
}

export function renderEmail(opts: RenderEmailOptions): string {
  const year = new Date().getFullYear();
  const labelColor = opts.labelDanger ? EMAIL.danger : EMAIL.onInkMuted;
  const heading = opts.heading
    ? `<h1 style="margin: 0 0 16px 0; color: ${EMAIL.ink}; font-size: 20px; font-weight: 600; line-height: 1.3;">${escapeHtml(opts.heading)}</h1>`
    : "";
  const noReply = opts.noReply === false
    ? ""
    : `<p style="margin: 0 0 8px 0; color: ${EMAIL.onInkMuted}; font-size: 12px;">This mailbox is not monitored. Please do not reply to this email.</p>`;
  const contact = opts.contactEmail
    ? `<p style="margin: 0 0 12px 0; color: ${EMAIL.onInkMuted}; font-size: 13px;">Questions? Contact <a href="mailto:${escapeHtml(opts.contactEmail)}" style="color: #ffffff; text-decoration: underline;">${escapeHtml(opts.contactEmail)}</a></p>`
    : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(opts.title || opts.documentLabel)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: ${EMAIL.paper}; font-family: ${EMAIL.font};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: ${EMAIL.paper};">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border: 1px solid ${EMAIL.rule}; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background-color: ${EMAIL.ink}; padding: 22px 32px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td valign="middle">
                    <p style="margin: 0; color: #ffffff; font-size: 15px; font-weight: 700;">${escapeHtml(EMAIL.legalName)}</p>
                    <p style="margin: 4px 0 0 0; color: ${labelColor}; font-size: 11px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase;">${escapeHtml(opts.documentLabel)}</p>
                  </td>
                  <td align="right" valign="middle" width="120">
                    <img src="${EMAIL.logoUrl}" alt="${escapeHtml(EMAIL.companyName)}" width="110" style="display: block; width: 110px; height: auto;" />
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px;">
              ${heading}
              ${opts.bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="background-color: ${EMAIL.ink}; padding: 20px 32px;">
              ${noReply}
              ${contact}
              <p style="margin: 0; color: ${EMAIL.onInkMuted}; font-size: 11px;">© ${year} ${escapeHtml(EMAIL.companyName)} · ${escapeHtml(EMAIL.addressLine)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
