const EMAIL_PREVIEW = {
  ink: "#232931",
  body: "#464E59",
  muted: "#78808A",
  onInkMuted: "#A8B0BB",
  rule: "#DCE0E6",
  paper: "#FBFAF9",
  panel: "#F5F6F8",
  danger: "#B8372E",
  logoUrl: "https://spxdyqdygsmzyngrqxni.supabase.co/storage/v1/object/public/print-files/demo/vibe-logo-dark.png",
};

function escapeEmailHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function messageHtml(message: string): string {
  return message
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p style="margin:0 0 16px;color:${EMAIL_PREVIEW.body};font-size:15px;line-height:1.6;">${escapeEmailHtml(line)}</p>`)
    .join("");
}

export interface EmailPreviewDetail {
  label: string;
  value: string;
  emphasis?: boolean;
  danger?: boolean;
}

interface BrandedEmailPreviewOptions {
  documentLabel: string;
  subject: string;
  message: string;
  details: EmailPreviewDetail[];
  contactEmail?: string;
  actionLabel?: string;
  labelDanger?: boolean;
  closingText?: string;
}

export function buildBrandedEmailPreview({
  documentLabel,
  subject,
  message,
  details,
  contactEmail,
  actionLabel,
  labelDanger = false,
  closingText,
}: BrandedEmailPreviewOptions): string {
  const detailRows = details.map((detail, index) => `
    <tr><td style="padding:${index === 0 ? 0 : 12}px 0 0;${index === 0 ? "" : `border-top:1px solid ${EMAIL_PREVIEW.rule};`}">
      <p style="margin:${index === 0 ? 0 : 12}px 0 0;color:${EMAIL_PREVIEW.muted};font-size:12px;font-weight:600;">${escapeEmailHtml(detail.label)}</p>
      <p style="margin:3px 0 0;color:${detail.danger ? EMAIL_PREVIEW.danger : EMAIL_PREVIEW.ink};font-size:${detail.emphasis ? 20 : 15}px;font-weight:${detail.emphasis ? 700 : 500};">${escapeEmailHtml(detail.value)}</p>
    </td></tr>`).join("");
  const action = actionLabel ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:4px auto 20px;"><tr><td style="background:${EMAIL_PREVIEW.ink};border-radius:6px;padding:12px 24px;color:#fff;font-size:14px;font-weight:600;">${escapeEmailHtml(actionLabel)}</td></tr></table>` : "";
  const contact = contactEmail ? `<p style="margin:0 0 12px;color:${EMAIL_PREVIEW.onInkMuted};font-size:13px;">Questions? Contact <span style="color:#fff;text-decoration:underline;">${escapeEmailHtml(contactEmail)}</span></p>` : "";

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeEmailHtml(subject)}</title></head>
  <body style="margin:0;padding:0;background:${EMAIL_PREVIEW.paper};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${EMAIL_PREVIEW.paper};"><tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#fff;border:1px solid ${EMAIL_PREVIEW.rule};border-radius:8px;overflow:hidden;">
    <tr><td style="background:${EMAIL_PREVIEW.ink};padding:22px 32px;"><table role="presentation" width="100%"><tr>
      <td><p style="margin:0;color:#fff;font-size:15px;font-weight:700;">ArmorPak Inc. DBA Vibe Packaging</p><p style="margin:4px 0 0;color:${labelDanger ? EMAIL_PREVIEW.danger : EMAIL_PREVIEW.onInkMuted};font-size:11px;font-weight:700;letter-spacing:1.2px;">${escapeEmailHtml(documentLabel.toUpperCase())}</p></td>
      <td align="right" width="120"><img src="${EMAIL_PREVIEW.logoUrl}" alt="Vibe Packaging" width="110" style="display:block;width:110px;height:auto;"></td>
    </tr></table></td></tr>
    <tr><td style="padding:32px;">${messageHtml(message)}
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${EMAIL_PREVIEW.panel};border:1px solid ${EMAIL_PREVIEW.rule};border-radius:6px;margin:0 0 24px;"><tr><td style="padding:20px 24px;"><table role="presentation" width="100%">${detailRows}</table></td></tr></table>
      ${action}${closingText ? `<p style="margin:0;color:${EMAIL_PREVIEW.muted};font-size:13px;line-height:1.6;">${escapeEmailHtml(closingText)}</p>` : ""}
    </td></tr>
    <tr><td style="background:${EMAIL_PREVIEW.ink};padding:20px 32px;"><p style="margin:0 0 8px;color:${EMAIL_PREVIEW.onInkMuted};font-size:12px;">This mailbox is not monitored. Please do not reply to this email.</p>${contact}<p style="margin:0;color:${EMAIL_PREVIEW.onInkMuted};font-size:11px;">© ${new Date().getFullYear()} Vibe Packaging · 1415 S 700 W · Salt Lake City, UT 84104 · www.vibepkg.com</p></td></tr>
  </table></td></tr></table></body></html>`;
}