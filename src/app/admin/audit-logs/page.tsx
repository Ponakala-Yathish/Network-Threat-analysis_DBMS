'use client';

import { useState } from 'react';
import { DataTable, Column } from '@/components/ui/DataTable';
import { format } from 'date-fns';
import { Download, Filter } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent } from '@/components/ui/Card';

interface AuditLogRow {
  audit_id: number;
  incident_id: number;
  incident_attacker_ip: string;
  incident_status: string;
  user_username: string;
  user_role: string;
  action: string;
  old_status: string | null;
  new_status: string | null;
  notes: string | null;
  created_at: string;
}

export default function AuditLogsPage() {
  const [data, setData] = useState<AuditLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    user_id: '',
    action: '',
    incident_id: '',
    date_from: '',
    date_to: '',
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        page_size: pageSize.toString(),
        ...Object.fromEntries(
          Object.entries(filters).filter(([, v]) => v !== '')
        ),
      });

      const res = await fetch(`/api/admin/audit-logs?${params}`);
      const result = await res.json();

      if (res.ok) {
        setData(result.data);
        setTotal(result.total);
      }
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const columns: Column<AuditLogRow>[] = [
    {
      id: 'created_at',
      accessorKey: 'created_at',
      header: 'Timestamp',
      cell: ({ row }) => format(new Date(row.getValue('created_at')), 'MMM dd, yyyy HH:mm:ss'),
      size: 160,
      enableSorting: true,
    },
    {
      id: 'incident_id',
      accessorKey: 'incident_id',
      header: 'Incident ID',
      cell: ({ row }) => <code className="text-sm bg-gray-100 px-1.5 py-0.5 rounded">#{row.getValue('incident_id')}</code>,
      size: 100,
      enableSorting: true,
    },
    {
      id: 'incident_attacker_ip',
      accessorKey: 'incident_attacker_ip',
      header: 'Attacker IP',
      size: 130,
      enableSorting: true,
    },
    {
      id: 'user_username',
      accessorKey: 'user_username',
      header: 'User',
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.getValue('user_username')}</p>
          <Badge variant="secondary" className="mt-0.5">{row.getValue('user_role')}</Badge>
        </div>
      ),
      size: 140,
      enableSorting: true,
    },
    {
      id: 'action',
      accessorKey: 'action',
      header: 'Action',
      cell: ({ row }) => {
        const action = row.getValue('action');
        return <Badge variant={action === 'resolve' ? 'success' : 'info'}>{action}</Badge>;
      },
      size: 100,
      enableSorting: true,
    },
    {
      id: 'old_status',
      accessorKey: 'old_status',
      header: 'Old Status',
      cell: ({ row }) => row.getValue('old_status') ? (
        <Badge variant={row.getValue('old_status') === 'Active' ? 'warning' : 'success'}>{row.getValue('old_status')}</Badge>
      ) : '-',
      size: 100,
    },
    {
      id: 'new_status',
      accessorKey: 'new_status',
      header: 'New Status',
      cell: ({ row }) => row.getValue('new_status') ? (
        <Badge variant={row.getValue('new_status') === 'Active' ? 'warning' : 'success'}>{row.getValue('new_status')}</Badge>
      ) : '-',
      size: 100,
    },
    {
      id: 'notes',
      accessorKey: 'notes',
      header: 'Notes',
      cell: ({ row }) => row.getValue('notes') ? (
        <span className="text-gray-600 max-w-xs truncate block" title={row.getValue('notes')!}>
          {row.getValue('notes')}
        </span>
      ) : '-',
      size: 200,
    },
  ];

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const handleExport = async () => {
    const params = new URLSearchParams({
      ...Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v !== '')
      ),
      export: 'true',
    });

    const res = await fetch(`/api/admin/audit-logs?${params}`);
    if (res.ok) {
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-logs-${format(new Date(), 'yyyy-MM-dd')}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Audit Logs</h1>
          <p className="text-gray-500 mt-1">Immutable ledger of all analyst resolution actions</p>
        </div>
        <Button variant="outline" onClick={handleExport} className="w-full sm:w-auto">
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <Input
              placeholder="User ID"
              value={filters.user_id}
              onChange={(e) => handleFilterChange('user_id', e.target.value)}
              type="number"
            />
            <Select
              placeholder="Action"
              options={[
                { value: '', label: 'All Actions' },
                { value: 'resolve', label: 'Resolve' },
                { value: 'create', label: 'Create' },
                { value: 'update', label: 'Update' },
              ]}
              value={filters.action}
              onChange={(e) => handleFilterChange('action', e.target.value)}
            />
            <Input
              placeholder="Incident ID"
              value={filters.incident_id}
              onChange={(e) => handleFilterChange('incident_id', e.target.value)}
              type="number"
            />
            <Input
              placeholder="From Date"
              value={filters.date_from}
              onChange={(e) => handleFilterChange('date_from', e.target.value)}
              type="datetime-local"
            />
            <Input
              placeholder="To Date"
              value={filters.date_to}
              onChange={(e) => handleFilterChange('date_to', e.target.value)}
              type="datetime-local"
            />
          </div>
        </CardContent>
      </Card>

      <DataTable
        data={data}
        columns={columns}
        totalCount={total}
        pageCount={Math.ceil(total / pageSize)}
        isLoading={loading}
        onPageChange={setPage}
        pageSizeOptions={[10, 20, 50, 100]}
      />
    </div>
  );
}