'use client';

import { useState } from 'react';
import { DataTable, Column } from '@/components/ui/DataTable';
import { format } from 'date-fns';
import { Plus, Trash2, Edit } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/Card';

interface UserRow {
  user_id: number;
  username: string;
  role: 'Admin' | 'Analyst';
  created_at: string;
}

export default function UsersPage() {
  const [data, setData] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<UserRow | null>(null);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    role: 'Analyst' as 'Admin' | 'Analyst',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users');
      const result = await res.json();
      if (res.ok) {
        setData(result);
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!formData.username.trim()) errors.username = 'Username is required';
    else if (formData.username.length < 3) errors.username = 'Username must be at least 3 characters';
    if (!editingUser && !formData.password) errors.password = 'Password is required';
    else if (formData.password && formData.password.length < 8) errors.password = 'Password must be at least 8 characters';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setSubmitting(true);
    try {
      const url = editingUser ? `/api/admin/users/${editingUser.user_id}` : '/api/admin/users';
      const method = editingUser ? 'PUT' : 'POST';

      const body = editingUser
        ? { username: formData.username, role: formData.role, ...(formData.password && { password: formData.password }) }
        : { username: formData.username, password: formData.password, role: formData.role };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save user');
      }

      setModalOpen(false);
      fetchUsers();
    } catch (error: any) {
      setFormErrors({ submit: error.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;

    try {
      const res = await fetch(`/api/admin/users/${deleteConfirm.user_id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to delete user');
      }

      setDeleteConfirm(null);
      fetchUsers();
    } catch (error: any) {
      alert(error.message);
    }
  };

  const openCreateModal = () => {
    setEditingUser(null);
    setFormData({ username: '', password: '', role: 'Analyst' });
    setFormErrors({});
    setModalOpen(true);
  };

  const openEditModal = (user: UserRow) => {
    setEditingUser(user);
    setFormData({ username: user.username, password: '', role: user.role });
    setFormErrors({});
    setModalOpen(true);
  };

  const columns: Column<UserRow>[] = [
    {
      id: 'username',
      accessorKey: 'username',
      header: 'Username',
      cell: ({ row }) => <code className="text-sm bg-gray-100 px-1.5 py-0.5 rounded">{row.getValue('username')}</code>,
      size: 180,
      enableSorting: true,
    },
    {
      id: 'role',
      accessorKey: 'role',
      header: 'Role',
      cell: ({ row }) => (
        <Badge variant={row.getValue('role') === 'Admin' ? 'info' : 'secondary'}>
          {row.getValue('role')}
        </Badge>
      ),
      size: 120,
      enableSorting: true,
    },
    {
      id: 'created_at',
      accessorKey: 'created_at',
      header: 'Created',
      cell: ({ row }) => format(new Date(row.getValue('created_at')), 'MMM dd, yyyy HH:mm'),
      size: 160,
      enableSorting: true,
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openEditModal(row.original)}
            className="text-gray-600 hover:text-blue-600"
            aria-label={`Edit ${row.original.username}`}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDeleteConfirm(row.original)}
            className="text-gray-600 hover:text-red-600"
            disabled={row.original.username === 'admin'}
            aria-label={`Delete ${row.original.username}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
      size: 100,
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          <p className="text-gray-500 mt-1">Manage admin and analyst accounts</p>
        </div>
        <Button onClick={openCreateModal}>
          <Plus className="h-4 w-4 mr-2" />
          Add User
        </Button>
      </div>

      <DataTable
        data={data}
        columns={columns}
        isLoading={loading}
        showSearch={false}
        showPagination={false}
      />

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingUser ? 'Edit User' : 'Create User'}
        size="sm"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Username"
            value={formData.username}
            onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
            error={formErrors.username}
            disabled={!!editingUser && editingUser.username === 'admin'}
            helperText={editingUser && editingUser.username === 'admin' ? 'Admin username cannot be changed' : undefined}
          />
          <Input
            label={editingUser ? 'New Password (leave blank to keep current)' : 'Password'}
            type="password"
            value={formData.password}
            onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
            error={formErrors.password}
            helperText={editingUser ? 'Leave blank to keep current password' : 'Minimum 8 characters'}
          />
          <Select
            label="Role"
            options={[
              { value: 'Admin', label: 'Admin' },
              { value: 'Analyst', label: 'Analyst' },
            ]}
            value={formData.role}
            onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value as 'Admin' | 'Analyst' }))}
            error={formErrors.role}
          />
          {formErrors.submit && (
            <div className="text-red-600 text-sm" role="alert">{formErrors.submit}</div>
          )}
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              {editingUser ? 'Update' : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={handleDelete}
        title="Delete User"
        message={deleteConfirm ? `Are you sure you want to delete user "${deleteConfirm.username}"? This action cannot be undone.` : ''}
        confirmText="Delete"
        variant="danger"
      />
    </div>
  );
}