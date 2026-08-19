// Reading a vendor's own invoice (their bill to us) into the handful of numbers we need.
//
// This is the ONE copy. parse-vendor-bill (the admin dialog's "Read invoice" button) and
// draft-vendor-bill-from-upload (the automatic pass over vendor portal uploads) both import
// it. Do not re-transcribe this into either function - a hand-copied money routine is exactly
// what drifted between the app and the QuickBooks sync once already.
//
// Nothing here writes to the database. Callers decide what to do with the draft, and in both
// cases an admin confirms it before it counts as what we owe.

export interface ParsedBill {
  invoice_number: string | null;
  bill_date: string | null;
  due_date: string | null;
  subtotal: number;
  freight: number;
  total: number;
  currency: string;
  notes: string | null;
}

export interface ParseResult {
  bill: ParsedBill;
  confidence: 'high' | 'medium' | 'low';
}

const PROMPT = (extractedText: string) => `Extract the billing figures from this supplier invoice.

RULES:
- Numbers must be plain decimals, no currency symbols or thousands separators. 1234.56 not "$1,234.56".
- "total" is the final amount payable -- the grand total / amount due / balance due, AFTER freight
  and any surcharges. This is the single most important field.
- "freight" is shipping/freight/delivery charges only. Use 0 if none is shown.
- "subtotal" is the goods amount before freight. If the invoice only shows a grand total, set
  subtotal to the total minus freight.
- Dates as YYYY-MM-DD. Use null if a date is not shown -- do NOT invent one.
- "invoice_number" is the SUPPLIER'S invoice number, not our PO number.
- If a field genuinely is not on the document, return null rather than guessing.
- "confidence" is your honest read of how clearly the total was stated: "high", "medium" or "low".

INVOICE TEXT:
${extractedText}

Return ONLY valid JSON:
{
  "invoice_number": "...",
  "bill_date": "YYYY-MM-DD",
  "due_date": "YYYY-MM-DD",
  "subtotal": 0.0,
  "freight": 0.0,
  "total": 0.0,
  "currency": "USD",
  "confidence": "high",
  "notes": null
}`;

// Vendors send PDFs and spreadsheets in roughly equal measure - Winstar send PDFs, QINGDAO send
// xlsx - so both have to work server-side for the automatic pass to be useful.
export async function extractText(bytes: Uint8Array, filename: string): Promise<string> {
  const lower = (filename || '').toLowerCase();

  if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv')) {
    const XLSX = await import('npm:xlsx@0.18.5');
    const wb = XLSX.read(bytes, { type: 'array' });
    return wb.SheetNames
      .map((name: string) => `--- ${name} ---\n${XLSX.utils.sheet_to_csv(wb.Sheets[name])}`)
      .join('\n\n');
  }

  const pdfParse = (await import('npm:pdf-parse@1.1.1')).default;
  const pdfData = await pdfParse(bytes);
  return pdfData.text || '';
}

const num = (v: unknown): number => {
  const n = Number(String(v ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

export async function parseBillText(
  extractedText: string,
  lovableApiKey: string,
): Promise<ParseResult> {
  if (!extractedText.trim()) {
    throw new Error('That document had no readable text (it may be a scan). Enter the bill manually.');
  }

  const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${lovableApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        {
          role: 'system',
          content: 'You extract totals from supplier invoices. You are precise with numbers and never guess.',
        },
        { role: 'user', content: PROMPT(extractedText) },
      ],
      response_format: { type: 'json_object' },
    }),
  });

  if (!aiResponse.ok) {
    const errorText = await aiResponse.text();
    console.error('AI API error:', aiResponse.status, errorText);
    throw new Error('Failed to read the invoice. Enter the bill manually.');
  }

  const aiData = await aiResponse.json();
  let content = aiData.choices[0].message.content;
  content = content.replace(/^```(?:json)?\s*\n/m, '').replace(/\n```\s*$/m, '');

  const parsed = JSON.parse(content);

  const total = num(parsed.total);
  const freight = num(parsed.freight);
  // Trust the stated grand total; derive the subtotal from it so the parts always add up.
  const subtotal = parsed.subtotal != null && num(parsed.subtotal) > 0
    ? num(parsed.subtotal)
    : Math.round((total - freight) * 100) / 100;

  return {
    bill: {
      invoice_number: parsed.invoice_number || null,
      bill_date: parsed.bill_date || null,
      due_date: parsed.due_date || null,
      subtotal,
      freight,
      total,
      currency: parsed.currency || 'USD',
      notes: parsed.notes || null,
    },
    confidence: (parsed.confidence || 'low') as ParseResult['confidence'],
  };
}
