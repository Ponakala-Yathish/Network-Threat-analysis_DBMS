'use client';

import { useState } from 'react';
import { DataTable, Column } from '@/components/ui/DataTable';
import { format } from 'date-fns';
import { Search, Filter, RefreshCw, AlertTriangle, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Card, CardContent } from '@/components/ui/Card';

interface TrafficLogRow {
  log_id: number;
  attacker_ip: string;
  target_ip: string;
  target_hostname: string | null;
  status: 'Allowed' | 'Blocked' | 'Failed';
  protocol: string | null;
  port: number | null;
  bytes_transferred: number;
  asset_criticality: number;
  asset_department: string | null;
  timestamp: string;
}

export default function TrafficLogsPage() {
  const [data, setData] = useState<TrafficLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    attacker_ip: '',
    target_id: '',
    status: '',
    protocol: '',
    port: '',
    date_from: '',
    date_to: '',
  });
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formData, setFormData] = useState({
    attackerIp: '',
    targetId: '',
    status: 'Failed' as 'Allowed' | 'Blocked' | 'Failed',
    protocol: '',
    port: '',
    bytesTransferred: 0,
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

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

      const res = await fetch(`/api/traffic-logs?${params}`);
      const result = await res.json();

      if (res.ok) {
        setData(result.data);
        setTotal(result.total);
      }
    } catch (error) {
      console.error('Failed to fetch traffic logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!formData.attackerIp.trim()) errors.attackerIp = 'Attacker IP is required';
    else if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(formData.attackerIp)) errors.attackerIp = 'Invalid IP format';
    if (!formData.targetId) errors.targetId = 'Target asset is required';
    if (!formData.status) errors.status = 'Status is required';
    if (formData.port && (parseInt(formData.port) < 1 || parseInt(formData.port) > 65535)) {
      errors.port = 'Port must be 1-65535';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setCreating(true);
    try {
      const res = await fetch('/api/traffic-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attackerIp: formData.attackerIp,
          targetId: parseInt(formData.targetId),
          status: formData.status,
          protocol: formData.protocol || undefined,
          port: formData.port ? parseInt(formData.port) : undefined,
          bytesTransferred: formData.bytesTransferred,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to create traffic log');
      }

      setCreateModalOpen(false);
      setFormData({ attackerIp: '', targetId: '', status: 'Failed', protocol: '', port: '', bytesTransferred: 0 });
      setFormErrors({});
      fetchData();
    } catch (err: any) {
      setFormErrors({ submit: err.message });
    } finally {
      setCreating(false);
    }
  };

  const columns: Column<TrafficLogRow>[] = [
    {
      id: 'timestamp',
      accessorKey: 'timestamp',
      header: 'Timestamp',
      cell: ({ row }) => format(new Date(row.getValue('timestamp')), 'MMM dd, HH:mm:ss'),
      size: 130,
      enableSorting: true,
    },
    {
      id: 'attacker_ip',
      accessorKey: 'attacker_ip',
      header: 'Attacker IP',
      cell: ({ row }) => (
        <code className="text-sm bg-gray-100 px-1.5 py-0.5 rounded">{row.getValue('attacker_ip')}</code>
      ),
      size: 140,
      enableSorting: true,
    },
    {
      id: 'target_ip',
      accessorKey: 'target_ip',
      header: 'Target',
      cell: ({ row }) => (
        <div>
          <p className="font-mono text-sm">{row.getValue('target_ip')}</p>
          {row.getValue('target_hostname') && (
            <p className="text-xs text-gray-500">{row.getValue('target_hostname')}</p>
          )}
        </div>
      ),
      size: 150,
      enableSorting: true,
    },
    {
      id: 'status',
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const status = row.getValue('status') as 'Allowed' | 'Blocked' | 'Failed';
        const variants = { Allowed: 'success', Blocked: 'warning', Failed: 'danger' } as const;
        return <Badge variant={variants[status]}>{status}</Badge>;
      },
      size: 100,
      enableSorting: true,
    },
    {
      id: 'protocol',
      accessorKey: 'protocol',
      header: 'Protocol',
      cell: ({ row }) => row.getValue('protocol') || '-',
      size: 90,
      enableSorting: true,
    },
    {
      id: 'port',
      accessorKey: 'port',
      header: 'Port',
      cell: ({ row }) => row.getValue('port') || '-',
      size: 70,
      enableSorting: true,
    },
    {
      id: 'bytes_transferred',
      accessorKey: 'bytes_transferred',
      header: 'Bytes',
      cell: ({ row }) => row.getValue('bytes_transferred').toLocaleString(),
      size: 100,
      enableSorting: true,
    },
    {
      id: 'asset_criticality',
      accessorKey: 'asset_criticality',
      header: 'Criticality',
      cell: ({ row }) => {
        const crit = row.getValue('asset_criticality');
        const color = crit >= 8 ? 'danger' : crit >= 5 ? 'warning' : 'success';
        return <Badge variant={color}>{crit}</Badge>;
      },
      size: 90,
      enableSorting: true,
    },
    {
      id: 'asset_department',
      accessorKey: 'asset_department',
      header: 'Department',
      cell: ({ row }) => row.getValue('asset_department') || '-',
      size: 110,
      enableSorting: true,
    },
  ];

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Traffic Logs</h1>
          <p className="text-gray-500 mt-1">Network traffic monitoring and anomaly detection</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button variant="outline" onClick={fetchData} className="w-full sm:w-auto">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={() => setCreateModalOpen(true)} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            Add Log
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-4">
            <Input
              placeholder="Attacker IP"
              value={filters.attacker_ip}
              onChange={(e) => handleFilterChange('attacker_ip', e.target.value)}
            />
            <Input
              placeholder="Target ID"
              value={filters.target_id}
              onChange={(e) => handleFilterChange('target_id', e.target.value)}
              type="number"
            />
            <Select
              placeholder="Status"
              options={[
                { value: '', label: 'All' },
                { value: 'Allowed', label: 'Allowed' },
                { value: 'Blocked', label: 'Blocked' },
                { value: 'Failed', label: 'Failed' },
              ]}
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
            />
            <Input
              placeholder="Protocol"
              value={filters.protocol}
              onChange={(e) => handleFilterChange('protocol', e.target.value)}
            />
            <Input
              placeholder="Port"
              value={filters.port}
              onChange={(e) => handleFilterChange('port', e.target.value)}
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
        showSearch={true}
        searchPlaceholder="Search attacker IP, target, protocol..."
      />

      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Create Traffic Log Entry"
        description="Manually add a traffic log entry. Failed connections may trigger automatic incident creation."
        size="md"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Attacker IP"
              value={formData.attackerIp}
              onChange={(e) => setFormData(prev => ({ ...prev, attackerIp: e.target.value }))}
              error={formErrors.attackerIp}
              placeholder="192.168.1.100"
            />
            <Select
              label="Target Asset"
              options={[
                { value: '', label: 'Select asset...' },
                { value: '1', label: '10.0.1.10 - web-server-01 (DMZ, Crit: 9)' },
                { value: '2', label: '10.0.1.11 - web-server-02 (DMZ, Crit: 8)' },
                { value: '3', label: '10.0.1.20 - app-server-01 (Application, Crit: 7)' },
                { value: '4', label: '10.0.1.21 - app-server-02 (Application, Crit: 7)' },
                { value: '5', label: '10.0.1.30 - db-primary (Database, Crit: 10)' },
                { value: '6', label: '10.0.1.31 - db-replica (Database, Crit: 8)' },
                { value: '7', label: '10.0.2.10 - file-server (Storage, Crit: 5)' },
                { value: '8', label: '10.0.2.20 - backup-server (Storage, Crit: 4)' },
                { value: '9', label: '10.0.3.10 - dc-primary (Infrastructure, Crit: 10)' },
                { value: '10', label: '10.0.3.11 - dc-secondary (Infrastructure, Crit: 9)' },
              ]}
              value={formData.targetId}
              onChange={(e) => setFormData(prev => ({ ...prev, targetId: e.target.value }))}
              error={formErrors.targetId}
            />
            <Select
              label="Status"
              options={[
                { value: 'Allowed', label: 'Allowed' },
                { value: 'Blocked', label: 'Blocked' },
                { value: 'Failed', label: 'Failed (triggers incident detection)' },
              ]}
              value={formData.status}
              onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as any }))}
              error={formErrors.status}
            />
            <Input
              label="Protocol"
              value={formData.protocol}
              onChange={(e) => setFormData(prev => ({ ...prev, protocol: e.target.value }))}
              placeholder="TCP, UDP, ICMP"
            />
            <Input
              label="Port"
              value={formData.port}
              onChange={(e) => setFormData(prev => ({ ...prev, port: e.target.value }))}
              error={formErrors.port}
              type="number"
              placeholder="80, 443, 22"
            />
            <Input
              label="Bytes Transferred"
              value={formData.bytesTransferred.toString()}
              onChange={(e) => setFormData(prev => ({ ...prev, bytesTransferred: parseInt(e.target.value) || 0 }))}
              type="number"
              placeholder="0"
            />
          </div>
          {formErrors.submit && (
            <div className="text-red-600 text-sm" role="alert">{formErrors.submit}</div>
          )}
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="ghost" onClick={() => setCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={creating}>
              <Plus className="h-4 w-4 mr-2" />
              Create Log Entry
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}