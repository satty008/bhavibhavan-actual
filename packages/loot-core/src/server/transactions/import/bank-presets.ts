// Presets for Indian banks whose CSV exports don't line up with the
// generic column-name heuristics in ImportTransactionsModal (which look
// for headers literally containing "date"/"amount"/"payee"). These banks
// export a fixed, well-known column layout instead, so we can recognize
// it from the header row and pre-fill the import mapping.

export type BankPresetId = 'axis-in' | 'icici-in';

export type BankPreset = {
  id: BankPresetId;
  name: string;
  // Exact header text as it appears in the CSV (after resolution below).
  dateField: string;
  dateFormat: 'dd mm yyyy';
  outflowField: string;
  inflowField: string;
  payeeField: string;
  // Axis statements wrap long UPI/NEFT narrations onto extra CSV rows that
  // repeat no date/amount, just more text in Particulars. Those need to be
  // folded into the preceding transaction rather than treated as rows of
  // their own.
  mergeContinuationRows?: boolean;
};

type FieldCandidates = {
  date: string[];
  outflow: string[];
  inflow: string[];
  payee: string[];
};

type PresetTemplate = Omit<
  BankPreset,
  'dateField' | 'outflowField' | 'inflowField' | 'payeeField'
> & { candidates: FieldCandidates };

const TEMPLATES: PresetTemplate[] = [
  {
    id: 'axis-in',
    name: 'Axis Bank (India)',
    dateFormat: 'dd mm yyyy',
    mergeContinuationRows: true,
    candidates: {
      date: ['tran date', 'transaction date'],
      outflow: ['debit', 'withdrawal amt', 'withdrawal amount'],
      inflow: ['credit', 'deposit amt', 'deposit amount'],
      payee: ['particulars'],
    },
  },
  {
    id: 'icici-in',
    name: 'ICICI Bank (India)',
    dateFormat: 'dd mm yyyy',
    candidates: {
      // "narration" is the one header ICICI uses that other Indian banks
      // don't, so it anchors detection even though date/debit/credit are
      // generic words other formats also use.
      date: ['transaction date', 'value date', 'date'],
      outflow: ['debit', 'withdrawal amount'],
      inflow: ['credit', 'deposit amount'],
      payee: ['narration'],
    },
  },
];

function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/\.$/, '')
    .replace(/\s+/g, ' ');
}

function resolveField(
  headers: string[],
  normalizedHeaders: string[],
  candidates: string[],
): string | null {
  for (const candidate of candidates) {
    const index = normalizedHeaders.indexOf(candidate);
    if (index !== -1) {
      return headers[index];
    }
  }
  return null;
}

/**
 * Given the header row of a parsed CSV, return a matching bank preset with
 * its field names resolved to the exact header text in this file, or null
 * if nothing matches.
 */
export function detectBankPreset(headers: string[]): BankPreset | null {
  const normalizedHeaders = headers.map(normalizeHeader);

  // Axis is distinctive on "particulars", which no other common Indian
  // bank export uses for the narration column.
  const hasParticulars = normalizedHeaders.includes('particulars');
  // ICICI is distinctive on "narration".
  const hasNarration = normalizedHeaders.includes('narration');

  let template: PresetTemplate | null = null;
  if (hasParticulars) {
    template = TEMPLATES.find(t => t.id === 'axis-in')!;
  } else if (hasNarration) {
    template = TEMPLATES.find(t => t.id === 'icici-in')!;
  }

  if (!template) {
    return null;
  }

  const dateField = resolveField(
    headers,
    normalizedHeaders,
    template.candidates.date,
  );
  const outflowField = resolveField(
    headers,
    normalizedHeaders,
    template.candidates.outflow,
  );
  const inflowField = resolveField(
    headers,
    normalizedHeaders,
    template.candidates.inflow,
  );
  const payeeField = resolveField(
    headers,
    normalizedHeaders,
    template.candidates.payee,
  );

  // If the anchor column matched but the rest of the expected shape isn't
  // there, this probably isn't actually that bank's export (or it's a
  // variant we don't understand yet) — don't force a bad mapping.
  if (!dateField || !outflowField || !inflowField || !payeeField) {
    return null;
  }

  return {
    id: template.id,
    name: template.name,
    dateFormat: template.dateFormat,
    mergeContinuationRows: template.mergeContinuationRows,
    dateField,
    outflowField,
    inflowField,
    payeeField,
  };
}

/**
 * Fold Axis-style continuation rows (a row with no date and no debit/credit,
 * just more Particulars text) into the previous real transaction's payee
 * field, and drop the continuation row.
 */
export function mergeContinuationRows(
  preset: BankPreset,
  rows: Array<Record<string, string>>,
): Array<Record<string, string>> {
  if (!preset.mergeContinuationRows) {
    return rows;
  }

  const merged: Array<Record<string, string>> = [];

  for (const row of rows) {
    const isContinuation =
      !row[preset.dateField]?.trim() &&
      !row[preset.outflowField]?.trim() &&
      !row[preset.inflowField]?.trim() &&
      row[preset.payeeField]?.trim();

    if (isContinuation && merged.length > 0) {
      const prev = merged[merged.length - 1];
      prev[preset.payeeField] =
        `${prev[preset.payeeField]} ${row[preset.payeeField].trim()}`.trim();
      continue;
    }

    merged.push(row);
  }

  return merged;
}
