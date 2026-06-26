'use client';

/**
 * Triggers a client-side CSV file download. The CSV string is produced on the
 * server (see lib/api.ts `toCsv`) and passed in as a prop, so no network
 * round-trip happens on click.
 */
import { Button } from '@/components/ui/button';

export function CsvDownloadButton({
  csv,
  filename,
  label = 'Download CSV',
}: {
  csv: string;
  filename: string;
  label?: string;
}) {
  const download = () => {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <Button
      type="button"
      variant="outline"
      onClick={download}
    >
      {label}
    </Button>
  );
}
