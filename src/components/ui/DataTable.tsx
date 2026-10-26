'use client';

import { useState, useMemo } from 'react';
import { clsx } from 'clsx';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Search, Filter } from 'lucide-react';
import { Button } from './Button';
import { Input } from './Input';
import { Select } from './Select';

export interface Column<T> {
  id: string;
  header: string | ((ctx: {}) => React.ReactNode);
  accessorKey?: keyof T;
  accessorFn?: (row: T) => any;
  cell?: (ctx: { row: { original: T; getValue: (key: string) => any } }) => React.ReactNode;
  size?: number;
  enableSorting?: boolean;
}

export type SortingState = Array<{ id: string; desc: boolean }>;
export type ColumnFiltersState = Array<{ id: string; value: unknown }>;
export type PaginationState = { pageIndex: number; pageSize: number };

export interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  totalCount?: number;
  pageCount?: number;
  isLoading?: boolean;
  onPageChange?: (page: number) => void;
  onSortChange?: (sorting: SortingState) => void;
  onFilterChange?: (filters: ColumnFiltersState) => void;
  onSearch?: (query: string) => void;
  searchPlaceholder?: string;
  showSearch?: boolean;
  showPagination?: boolean;
  pageSizeOptions?: number[];
}

export function DataTable<T>({
  data,
  columns,
  totalCount,
  pageCount,
  isLoading = false,
  onPageChange,
  onSortChange,
  onFilterChange,
  onSearch,
  searchPlaceholder = 'Search...',
  showSearch = true,
  showPagination = true,
  pageSizeOptions = [10, 20, 50, 100],
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 20,
  });

  const sortedData = useMemo(() => {
    if (sorting.length === 0) return data;
    return [...data].sort((a, b) => {
      for (const sort of sorting) {
        const col = columns.find(c => c.accessorKey === sort.id || c.id === sort.id);
        if (!col) continue;

        const aVal = col.accessorKey ? (a as any)[col.accessorKey] : col.accessorFn?.(a);
        const bVal = col.accessorKey ? (b as any)[col.accessorKey] : col.accessorFn?.(b);

        if (aVal === bVal) continue;
        if (aVal === null || aVal === undefined) return sort.desc ? -1 : 1;
        if (bVal === null || bVal === undefined) return sort.desc ? 1 : -1;

        const cmp = aVal < bVal ? -1 : 1;
        return sort.desc ? -cmp : cmp;
      }
      return 0;
    });
  }, [data, sorting, columns]);

  const filteredData = useMemo(() => {
    if (!globalFilter) return sortedData;
    const search = globalFilter.toLowerCase();
    return sortedData.filter(row => {
      return columns.some(col => {
        const val = col.accessorKey ? (row as any)[col.accessorKey] : col.accessorFn?.(row);
        return String(val || '').toLowerCase().includes(search);
      });
    });
  }, [sortedData, globalFilter, columns]);

  const paginatedData = useMemo(() => {
    const start = pagination.pageIndex * pagination.pageSize;
    return filteredData.slice(start, start + pagination.pageSize);
  }, [filteredData, pagination]);

  const handleSort = (columnId: string) => {
    const existing = sorting.find(s => s.id === columnId);
    let newSorting: SortingState;
    if (existing) {
      newSorting = sorting.map(s =>
        s.id === columnId ? { ...s, desc: !s.desc } : s
      );
    } else {
      newSorting = [...sorting, { id: columnId, desc: false }];
    }
    setSorting(newSorting);
    onSortChange?.(newSorting);
  };

  const handlePageChange = (pageIndex: number) => {
    setPagination(p => ({ ...p, pageIndex }));
    onPageChange?.(pageIndex + 1);
  };

  const handlePageSizeChange = (pageSize: number) => {
    setPagination(p => ({ ...p, pageSize, pageIndex: 0 }));
    onPageChange?.(1);
  };

  const canPreviousPage = pagination.pageIndex > 0;
  const canNextPage = (pagination.pageIndex + 1) * pagination.pageSize < (totalCount || filteredData.length);

  return (
    <div className="space-y-4">
      {showSearch && (
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder={searchPlaceholder}
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="pl-9"
            />
          </div>
          <Filter className="text-gray-400 h-5 w-5" />
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.id}
                  className={clsx(
                    'px-4 py-3 text-left font-medium text-gray-600 uppercase tracking-wider',
                    column.enableSorting && 'cursor-pointer hover:bg-gray-100 select-none'
                  )}
                  onClick={() => column.enableSorting && handleSort(column.id)}
                  style={{ width: column.size }}
                >
                  <div className="flex items-center gap-1">
                    {typeof column.header === 'function' ? column.header({}) : column.header}
                    {column.enableSorting && sorting.find(s => s.id === column.id) ? (
                      sorting.find(s => s.id === column.id)?.desc ? (
                        <ChevronDown className="h-4 w-4 text-blue-600" />
                      ) : (
                        <ChevronUp className="h-4 w-4 text-blue-600" />
                      )
                    ) : column.enableSorting && (
                      <span className="h-4 w-4" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {isLoading ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-gray-500">
                  <div className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5 text-blue-600" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Loading...
                  </div>
                </td>
              </tr>
            ) : paginatedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-gray-500">
                  No data available
                </td>
              </tr>
            ) : (
              paginatedData.map((row, rowIndex) => (
                <tr
                  key={(row as any).id || rowIndex}
                  className={clsx(
                    'hover:bg-gray-50 transition-colors',
                    rowIndex % 2 === 1 && 'bg-gray-50/50'
                  )}
                >
                  {columns.map((column) => (
                    <td
                      key={column.id}
                      className="px-4 py-3 text-gray-900"
                    >
                      {column.cell ? column.cell({ row: { original: row, getValue: (key: string) => (row as any)[key] } }) :
                       column.accessorKey ? String((row as any)[column.accessorKey] ?? '') : '-'}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showPagination && (
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span>
              Showing{' '}
              <strong>{pagination.pageIndex * pagination.pageSize + 1}</strong>{' '}
              to{' '}
              <strong>{Math.min((pagination.pageIndex + 1) * pagination.pageSize, totalCount || filteredData.length)}</strong>{' '}
              of <strong>{totalCount || filteredData.length}</strong> results
            </span>
            <select
              value={pagination.pageSize}
              onChange={(e) => handlePageSizeChange(Number(e.target.value))}
              className="px-2 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size} per page
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(pagination.pageIndex - 1)}
              disabled={!canPreviousPage}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(pagination.pageIndex + 1)}
              disabled={!canNextPage}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}