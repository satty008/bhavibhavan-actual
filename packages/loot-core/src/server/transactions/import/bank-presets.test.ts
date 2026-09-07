import { detectBankPreset, mergeContinuationRows } from './bank-presets';

describe('detectBankPreset', () => {
  test('recognizes an Axis Bank export', () => {
    const preset = detectBankPreset([
      'Tran Date',
      'Chq No',
      'Particulars',
      'Debit',
      'Credit',
      'Balance',
    ]);

    expect(preset).toMatchObject({
      id: 'axis-in',
      dateField: 'Tran Date',
      dateFormat: 'dd mm yyyy',
      outflowField: 'Debit',
      inflowField: 'Credit',
      payeeField: 'Particulars',
      mergeContinuationRows: true,
    });
  });

  test('recognizes an ICICI Bank export', () => {
    const preset = detectBankPreset([
      'Transaction Date',
      'Value Date',
      'Narration',
      'Cheque No.',
      'Debit',
      'Credit',
      'Balance',
    ]);

    expect(preset).toMatchObject({
      id: 'icici-in',
      dateField: 'Transaction Date',
      dateFormat: 'dd mm yyyy',
      outflowField: 'Debit',
      inflowField: 'Credit',
      payeeField: 'Narration',
    });
  });

  test('recognizes ICICI export using Withdrawal/Deposit Amount headers', () => {
    const preset = detectBankPreset([
      'Date',
      'Narration',
      'Withdrawal Amount',
      'Deposit Amount',
      'Balance',
    ]);

    expect(preset).toMatchObject({
      id: 'icici-in',
      dateField: 'Date',
      outflowField: 'Withdrawal Amount',
      inflowField: 'Deposit Amount',
    });
  });

  test('returns null for an unrelated CSV layout', () => {
    expect(
      detectBankPreset(['Date', 'Payee', 'Amount', 'Category']),
    ).toBeNull();
  });

  test('returns null when the anchor column matches but the rest of the shape does not', () => {
    // Has "narration" but is missing debit/credit entirely - could be some
    // other export we don't understand; don't force a bad mapping.
    expect(detectBankPreset(['Date', 'Narration', 'Balance'])).toBeNull();
  });
});

describe('mergeContinuationRows', () => {
  test('folds Axis continuation rows into the previous transaction', () => {
    const preset = detectBankPreset([
      'Tran Date',
      'Chq No',
      'Particulars',
      'Debit',
      'Credit',
      'Balance',
    ])!;

    const rows = [
      {
        'Tran Date': '02-11-2019',
        'Chq No': '',
        Particulars: 'UPI/726104686979/x99999/RIA',
        Debit: '35,000.00',
        Credit: '',
        Balance: '3,54,896.09',
      },
      {
        'Tran Date': '',
        'Chq No': '',
        Particulars: 'PAYMENT FROM Mr FOO BAR',
        Debit: '',
        Credit: '',
        Balance: '',
      },
      {
        'Tran Date': '05-11-2019',
        'Chq No': '147350',
        Particulars: 'CASH PAID : SELF',
        Debit: '4,000.00',
        Credit: '',
        Balance: '3,70,896.09',
      },
    ];

    const result = mergeContinuationRows(preset, rows);

    expect(result).toHaveLength(2);
    expect(result[0].Particulars).toBe(
      'UPI/726104686979/x99999/RIA PAYMENT FROM Mr FOO BAR',
    );
    expect(result[1].Particulars).toBe('CASH PAID : SELF');
  });

  test('is a no-op for presets that do not merge continuation rows', () => {
    const preset = detectBankPreset([
      'Transaction Date',
      'Narration',
      'Debit',
      'Credit',
      'Balance',
    ])!;

    const rows = [
      {
        'Transaction Date': '02-11-2019',
        Narration: 'ACH DEBIT',
        Debit: '100.00',
        Credit: '',
        Balance: '900.00',
      },
    ];

    expect(mergeContinuationRows(preset, rows)).toEqual(rows);
  });
});
