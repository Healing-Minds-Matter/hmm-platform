'use client'

import { createClubsBulkAction } from '@/actions/clubs'
import { BulkCsvUpload } from '@/components/bulk-csv-upload'
import { CLUB_CSV_COLUMNS, clubCsvHeaderError } from '@/lib/club-rules'

const code = 'rounded bg-[#F1F5F9] px-1.5 py-0.5 font-mono text-[11px]'

const TEMPLATE = {
  fileName: 'clubs-template.csv',
  rows: [
    [...CLUB_CSV_COLUMNS],
    ['Rotaract Club of Colombo', 'RAC-001', '12 Galle Rd, Colombo 03', 'colombo@example.com', '077 123 4567', 'Example row: replace or delete it'],
  ],
}

// "Bulk CSV Upload" tab of the Create New Club modal.
export function BulkClubUpload({ onClose }: { onClose: () => void }) {
  return (
    <BulkCsvUpload
      action={createClubsBulkAction}
      noun={{ one: 'club', many: 'clubs' }}
      template={TEMPLATE}
      checkHeader={clubCsvHeaderError}
      onClose={onClose}
      formatHelp={
        <p className="text-[12px] leading-[18px] text-[#475569]">
          Header row required, exactly: <code className={code}>{CLUB_CSV_COLUMNS.join(',')}</code>
          <br />
          <code className={code}>name</code>, <code className={code}>code</code> and <code className={code}>address</code> are
          required; the rest can be left empty. Names and codes must be unique. Put quotes around any value that
          contains a comma, e.g. <code className={code}>&quot;12 Galle Rd, Colombo 03&quot;</code>. Phone numbers without a
          country code are treated as Sri Lankan. Every club is created as Active.
        </p>
      }
    />
  )
}
