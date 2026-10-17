/** Builds one analysis-friendly CSV with a row type and the union of record fields. */
export function toRecordsCsv(groups: { type: string; rows: unknown[] }[]): string {
  const records: Record<string, unknown>[] = [];
  for (const group of groups) {
    for (const value of group.rows) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      records.push({ record_type: group.type, ...(value as Record<string, unknown>) });
    }
  }

  const columns = [
    'record_type',
    ...Array.from(new Set(records.flatMap((row) => Object.keys(row).filter((key) => key !== 'record_type')))).sort(),
  ];
  const cell = (value: unknown): string => {
    let text = value instanceof Date
      ? value.toISOString()
      : value !== null && typeof value === 'object'
        ? JSON.stringify(value)
        : value == null
          ? ''
          : String(value);

    // Spreadsheet programs may evaluate text cells as formulas. Preserve numeric values while
    // making attacker-controlled names and message content inert when the CSV is opened.
    if (typeof value === 'string' && /^[\t\r\n ]*[=+\-@]/.test(text) && !/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) {
      text = `'${text}`;
    }
    return `"${text.replace(/"/g, '""')}"`;
  };

  return `\uFEFF${[columns, ...records.map((row) => columns.map((key) => row[key]))]
    .map((row) => row.map(cell).join(','))
    .join('\r\n')}\r\n`;
}
