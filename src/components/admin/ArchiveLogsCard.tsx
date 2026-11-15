'use client';

// Runs the stored procedure archive_old_logs through POST /api/admin/archive-logs.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Archive } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

export function ArchiveLogsCard() {
  const router = useRouter();
  const [days, setDays] = useState('30');
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    setRunning(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/archive-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ older_than_days: parseInt(days, 10) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Archive failed');
      setMessage({ ok: true, text: `Moved ${data.archived} log(s) older than ${data.older_than_days} days to the archive.` });
      router.refresh(); // re-run the server component so the counters update
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Archive className="h-5 w-5 text-gray-700" />
          Archive old traffic logs
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={run} className="flex items-end gap-3">
          <div className="w-40">
            <Input
              label="Older than (days)"
              type="number"
              min={1}
              max={3650}
              value={days}
              onChange={(e) => setDays(e.target.value)}
              required
            />
          </div>
          <Button type="submit" loading={running}>
            Run archive
          </Button>
        </form>
        <p className="text-xs text-gray-500 mt-2">
          Runs <code>CALL archive_old_logs({days || 'n'}, NULL)</code>, which moves the rows into
          Traffic_Logs_Archive in one statement.
        </p>
        {message && (
          <p className={`text-sm mt-3 ${message.ok ? 'text-green-700' : 'text-red-600'}`} role="status">
            {message.text}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
