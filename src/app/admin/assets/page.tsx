'use client';

// Network assets: list / create / edit / delete, the connection topology, and
// the lateral-movement view (recursive CTE via /api/assets/:id/reachable).

import { useEffect, useState } from 'react';
import { Plus, Edit, Trash2, Share2, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Modal, ConfirmModal } from '@/components/ui/Modal';

interface Asset {
  asset_id: number;
  internal_ip: string;
  hostname: string | null;
  criticality: number;
  department: string | null;
  created_at: string;
}

interface Connection {
  src_asset_id: number;
  dst_asset_id: number;
  connection_type: string;
  src_hostname: string | null;
  src_ip: string;
  dst_hostname: string | null;
  dst_ip: string;
}

interface Reachable {
  asset_id: number;
  hostname: string | null;
  internal_ip: string;
  criticality: number;
  department: string | null;
  hops: number;
  path: string;
}

const CONNECTION_TYPES = ['network', 'database', 'file-share', 'admin', 'replication'];
const EMPTY_FORM = { internalIp: '', hostname: '', criticality: '5', department: '' };

const critVariant = (c: number) => (c >= 8 ? 'danger' : c >= 5 ? 'warning' : 'success');
const assetLabel = (a: { hostname: string | null; internal_ip: string }) =>
  a.hostname ? `${a.hostname} (${a.internal_ip})` : a.internal_ip;

async function readOrThrow(res: Response, fallback: string) {
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || fallback);
  return data;
}

export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Asset | null>(null);

  const [conn, setConn] = useState({ src: '', dst: '', type: 'network' });
  const [connError, setConnError] = useState('');

  const [reachFor, setReachFor] = useState<Asset | null>(null);
  const [reach, setReach] = useState<Reachable[]>([]);
  const [reachLoading, setReachLoading] = useState(false);
  const [maxHops, setMaxHops] = useState('5');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [a, c] = await Promise.all([
        fetch('/api/assets').then((r) => readOrThrow(r, 'Failed to load assets')),
        fetch('/api/asset-connections').then((r) => readOrThrow(r, 'Failed to load connections')),
      ]);
      setAssets(a);
      setConnections(c);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch on mount (same pattern as the Users page).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (a: Asset) => {
    setEditing(a);
    setForm({
      internalIp: a.internal_ip,
      hostname: a.hostname ?? '',
      criticality: String(a.criticality),
      department: a.department ?? '',
    });
    setFormError('');
    setModalOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const criticality = parseInt(form.criticality, 10);
      if (editing) {
        await readOrThrow(
          await fetch(`/api/assets/${editing.asset_id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hostname: form.hostname, criticality, department: form.department }),
          }),
          'Failed to update asset'
        );
      } else {
        await readOrThrow(
          await fetch('/api/assets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              internalIp: form.internalIp.trim(),
              hostname: form.hostname.trim() || undefined,
              criticality,
              department: form.department.trim() || undefined,
            }),
          }),
          'Failed to create asset'
        );
      }
      setModalOpen(false);
      load();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await readOrThrow(await fetch(`/api/assets/${deleting.asset_id}`, { method: 'DELETE' }), 'Failed to delete asset');
      setDeleting(null);
      load();
    } catch (e) {
      setDeleting(null);
      alert((e as Error).message);
    }
  };

  const addConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    setConnError('');
    try {
      await readOrThrow(
        await fetch('/api/asset-connections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ src_asset_id: conn.src, dst_asset_id: conn.dst, connection_type: conn.type }),
        }),
        'Failed to add connection'
      );
      setConn((c) => ({ ...c, src: '', dst: '' }));
      load();
    } catch (e) {
      setConnError((e as Error).message);
    }
  };

  const removeConnection = async (c: Connection) => {
    try {
      await readOrThrow(
        await fetch(`/api/asset-connections?src=${c.src_asset_id}&dst=${c.dst_asset_id}`, { method: 'DELETE' }),
        'Failed to delete connection'
      );
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const showReach = async (a: Asset, hops = maxHops) => {
    setReachFor(a);
    setReachLoading(true);
    try {
      setReach(
        await readOrThrow(await fetch(`/api/assets/${a.asset_id}/reachable?max_hops=${hops}`), 'Failed to load reachable assets')
      );
    } catch (e) {
      alert((e as Error).message);
      setReachFor(null);
    } finally {
      setReachLoading(false);
    }
  };

  const assetOptions = [
    { value: '', label: 'Select asset' },
    ...assets.map((a) => ({ value: String(a.asset_id), label: assetLabel(a) })),
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Network Assets</h1>
          <p className="text-gray-500 mt-1">Monitored hosts, their criticality, and how they connect</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Add Asset
        </Button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm" role="alert">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Assets ({assets.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-4 py-3 font-medium">IP address</th>
                  <th className="px-4 py-3 font-medium">Hostname</th>
                  <th className="px-4 py-3 font-medium">Department</th>
                  <th className="px-4 py-3 font-medium">Criticality</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {assets.map((a) => (
                  <tr key={a.asset_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono">{a.internal_ip}</td>
                    <td className="px-4 py-3">{a.hostname || <span className="text-gray-400">not set</span>}</td>
                    <td className="px-4 py-3">{a.department || <span className="text-gray-400">none</span>}</td>
                    <td className="px-4 py-3">
                      <Badge variant={critVariant(a.criticality)}>{a.criticality}/10</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => showReach(a)} title="Lateral movement">
                          <Share2 className="h-4 w-4 mr-1" />
                          Reach
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(a)} aria-label={`Edit ${a.internal_ip}`}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleting(a)}
                          aria-label={`Delete ${a.internal_ip}`}
                          className="hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-blue-600" />
            Network connections ({connections.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">
            A connection means the source host can reach the destination. The &ldquo;Reach&rdquo; button follows
            these connections recursively to show where an attacker could move next.
          </p>
          <form onSubmit={addConnection} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <Select
              label="From"
              options={assetOptions}
              value={conn.src}
              onChange={(e) => setConn((c) => ({ ...c, src: e.target.value }))}
            />
            <Select
              label="To"
              options={assetOptions}
              value={conn.dst}
              onChange={(e) => setConn((c) => ({ ...c, dst: e.target.value }))}
            />
            <Select
              label="Type"
              options={CONNECTION_TYPES.map((t) => ({ value: t, label: t }))}
              value={conn.type}
              onChange={(e) => setConn((c) => ({ ...c, type: e.target.value }))}
            />
            <Button type="submit" disabled={!conn.src || !conn.dst}>
              <Plus className="h-4 w-4 mr-2" />
              Add connection
            </Button>
          </form>
          {connError && (
            <div className="text-red-600 text-sm" role="alert">
              {connError}
            </div>
          )}
          <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
            {connections.length === 0 && <p className="p-4 text-sm text-gray-500">No connections yet.</p>}
            {connections.map((c) => (
              <div key={`${c.src_asset_id}-${c.dst_asset_id}`} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                <div className="min-w-0">
                  <span className="font-medium">{c.src_hostname || c.src_ip}</span>
                  <span className="text-gray-400 mx-2">→</span>
                  <span className="font-medium">{c.dst_hostname || c.dst_ip}</span>
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {c.connection_type}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeConnection(c)}
                  aria-label="Delete connection"
                  className="hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Asset' : 'Add Asset'}
        size="sm"
      >
        <form onSubmit={save} className="space-y-4">
          <Input
            label="Internal IP"
            value={form.internalIp}
            onChange={(e) => setForm((f) => ({ ...f, internalIp: e.target.value }))}
            disabled={!!editing}
            helperText={editing ? 'The IP address identifies the asset and cannot be changed' : 'e.g. 10.0.5.20'}
            required
          />
          <Input
            label="Hostname"
            value={form.hostname}
            onChange={(e) => setForm((f) => ({ ...f, hostname: e.target.value }))}
          />
          <Input
            label="Department"
            value={form.department}
            onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
          />
          <Input
            label="Criticality (1-10)"
            type="number"
            min={1}
            max={10}
            value={form.criticality}
            onChange={(e) => setForm((f) => ({ ...f, criticality: e.target.value }))}
            required
          />
          {formError && (
            <div className="text-red-600 text-sm" role="alert">
              {formError}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {editing ? 'Save' : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={!!reachFor}
        onClose={() => setReachFor(null)}
        title={reachFor ? `Reachable from ${assetLabel(reachFor)}` : ''}
        description="Every asset an attacker could reach from here by following network connections (WITH RECURSIVE)."
        size="xl"
      >
        <div className="flex items-end gap-3 mb-4">
          <div className="w-40">
            <Select
              label="Max hops"
              options={['1', '2', '3', '5', '10'].map((h) => ({ value: h, label: h }))}
              value={maxHops}
              onChange={(e) => {
                setMaxHops(e.target.value);
                if (reachFor) showReach(reachFor, e.target.value);
              }}
            />
          </div>
          <p className="text-sm text-gray-500 pb-2">
            {reachLoading ? 'Loading…' : `${Math.max(reach.length - 1, 0)} other assets reachable`}
          </p>
        </div>
        <div className="overflow-x-auto max-h-[60vh]">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-3 py-2 font-medium">Hops</th>
                <th className="px-3 py-2 font-medium">Asset</th>
                <th className="px-3 py-2 font-medium">Criticality</th>
                <th className="px-3 py-2 font-medium">Path</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {reach.map((r) => (
                <tr key={r.asset_id}>
                  <td className="px-3 py-2">{r.hops}</td>
                  <td className="px-3 py-2">{assetLabel(r)}</td>
                  <td className="px-3 py-2">
                    <Badge variant={critVariant(r.criticality)}>{r.criticality}/10</Badge>
                  </td>
                  <td className="px-3 py-2 text-gray-600">{r.path}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title="Delete Asset"
        message={
          deleting
            ? `Delete ${assetLabel(deleting)}? Assets with traffic logs or incidents cannot be deleted.`
            : ''
        }
        confirmText="Delete"
        variant="danger"
      />
    </div>
  );
}
