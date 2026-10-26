'use client';

import { useState } from 'react';
import { DataTable, Column } from '@/components/ui/DataTable';
import { format } from 'date-fns';
import { Search, Filter, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/Card';

interface IncidentRow {
  incident_id: number;
  attacker_ip: string;
  target_ip: string;
  target_hostname: string | null;
  asset_criticality: number;
  asset_department: string | null;
  status: 'Active' | 'Resolved';
  description: string | null;
  blast_radius_score: number;
  created_at: string;
}

export default function IncidentsPage() {
  const [data, setData] = useState<IncidentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    status: 'Active',
    attacker_ip: '',
    target_id: '',
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

      const res = await fetch(`/api/incidents?${params}`);
      const result = await res.json();

      if (res.ok) {
        setData(result.data);
        setTotal(result.total);
      }
    } catch (error) {
      console.error('Failed to fetch incidents:', error);
    } finally {
      setLoading(false);
    }
  };

  const columns: Column<IncidentRow>[] = [
    {
      id: 'incident_id',
      accessorKey: 'incident_id',
      header: 'ID',
      cell: ({ row }) => (
        <Link href={`/analyst/incidents/${row.getValue('incident_id')}`} className="font-mono text-blue-600 hover:underline">
          #{row.getValue('incident_id')}
        </Link>
      ),
      size: 80,
      enableSorting: true,
    },
    {
      id: 'attacker_ip',
      accessorKey: 'attacker_ip',
      header: 'Attacker IP',
      size: 140,
      enableSorting: true,
    },
    {
      id: 'target_ip',
      accessorKey: 'target_ip',
      header: 'Target Asset',
      cell: ({ row }) => (
        <div>
          <p className="font-mono text-sm">{row.getValue('target_ip')}</p>
          {row.getValue('target_hostname') && (
            <p className="text-xs text-gray-500">{row.getValue('target_hostname')}</p>
          )}
        </div>
      ),
      size: 160,
      enableSorting: true,
    },
    {
      id: 'asset_criticality',
      accessorKey: 'asset_criticality',
      header: 'Criticality',
      cell: ({ row }) => {
        const crit = row.getValue('asset_criticality');
        const color = crit >= 8 ? 'danger' : crit >= 5 ? 'warning' : 'success';
        return <Badge variant={color}>{crit}/10</Badge>;
      },
      size: 100,
      enableSorting: true,
    },
    {
      id: 'asset_department',
      accessorKey: 'asset_department',
      header: 'Department',
      cell: ({ row }) => row.getValue('asset_department') || '-',
      size: 120,
      enableSorting: true,
    },
    {
      id: 'status',
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const status = row.getValue('status');
        return (
          <Badge variant={status === 'Active' ? 'warning' : 'success'}>
            {status}
          </Badge>
        );
      },
      size: 100,
      enableSorting: true,
    },
    {
      id: 'blast_radius_score',
      accessorKey: 'blast_radius_score',
      header: 'Blast Radius',
      cell: ({ row }) => {
        const score = row.getValue('blast_radius_score');
        return <span className="font-mono text-sm">{score}</span>;
      },
      size: 110,
      enableSorting: true,
    },
    {
      id: 'created_at',
      accessorKey: 'created_at',
      header: 'Created',
      cell: ({ row }) => format(new Date(row.getValue('created_at')), 'MMM dd, HH:mm'),
      size: 130,
      enableSorting: true,
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <Link
          href={`/analyst/incidents/${row.getValue('incident_id')}`}
          className="text-blue-600 hover:underline text-sm font-medium"
        >
          View Details
        </Link>
      ),
      size: 110,
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
          <h1 className="text-2xl font-bold text-gray-900">Incident Queue</h1>
          <p className="text-gray-500 mt-1">Active and resolved security incidents</p>
        </div>
        <Button variant="outline" onClick={fetchData} className="w-full sm:w-auto">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <Select
              placeholder="Status"
              options={[
                { value: 'Active', label: 'Active' },
                { value: 'Resolved', label: 'Resolved' },
                { value: '', label: 'All' },
              ]}
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
            />
            <Input
              placeholder="Attacker IP"
              value={filters.attacker_ip}
              onChange={(e) => handleFilterChange('attacker_ip', e.target.value)}
            />
            <Input
              placeholder="Target Asset ID"
              value={filters.target_id}
              onChange={(e) => handleFilterChange('target_id', e.target.value)}
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