'use client';

// Vector-store CRUD for Security_Playbooks.
//   Create  -> POST   /api/playbooks          (server embeds the text into VECTOR(384))
//   Read    -> GET    /api/playbooks          (list)
//              GET    /api/playbooks?q=...    (cosine-similarity search, `<=>`)
//   Update  -> PUT    /api/playbooks/:id      (server re-embeds the new text)
//   Delete  -> DELETE /api/playbooks/:id
// Admins get every operation; analysts get list + search (canEdit = false),
// and the database itself also refuses analyst writes (no INSERT/UPDATE/DELETE grant).

import { useEffect, useState } from 'react';
import { Plus, Edit, Trash2, Search, X, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Modal, ConfirmModal } from '@/components/ui/Modal';

interface Playbook {
  playbook_id: number;
  title: string;
  threat_category: string | null;
  description: string;
  mitigation: string;
  tags: string[] | null;
  created_at: string;
  similarity?: number;
}

const EMPTY_FORM = { title: '', threat_category: '', description: '', mitigation: '', tags: '' };

const textareaClass =
  'w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm';

export function PlaybookManager({ canEdit }: { canEdit: boolean }) {
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [searchText, setSearchText] = useState('');
  const [activeSearch, setActiveSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Playbook | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [deleting, setDeleting] = useState<Playbook | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = async (q = activeSearch) => {
    setLoading(true);
    setError('');
    try {
      const url = q ? `/api/playbooks?q=${encodeURIComponent(q)}&limit=5` : '/api/playbooks';
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load playbooks');
      setPlaybooks(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch on mount (same pattern as the Users page).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchText.trim();
    setActiveSearch(q);
    load(q);
  };

  const clearSearch = () => {
    setSearchText('');
    setActiveSearch('');
    load('');
  };

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (pb: Playbook) => {
    setEditing(pb);
    setForm({
      title: pb.title,
      threat_category: pb.threat_category ?? '',
      description: pb.description,
      mitigation: pb.mitigation,
      tags: (pb.tags ?? []).join(', '),
    });
    setFormError('');
    setModalOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const body = {
        title: form.title,
        threat_category: form.threat_category.trim() || null,
        description: form.description,
        mitigation: form.mitigation,
        tags: form.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      };
      const res = await fetch(editing ? `/api/playbooks/${editing.playbook_id}` : '/api/playbooks', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save playbook');
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
      const res = await fetch(`/api/playbooks/${deleting.playbook_id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete playbook');
      setDeleting(null);
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Security Playbooks</h1>
          <p className="text-gray-500 mt-1">
            Mitigation playbooks stored with a 384-dimension vector (pgvector) for similarity search
          </p>
        </div>
        {canEdit && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Add Playbook
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5 text-blue-600" />
            Find similar playbooks
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={runSearch} className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Input
                placeholder="Describe a threat, e.g. 'many failed SSH logins from one IP'"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                aria-label="Describe a threat"
              />
            </div>
            <Button type="submit" disabled={!searchText.trim()}>
              <Search className="h-4 w-4 mr-2" />
              Search
            </Button>
            {activeSearch && (
              <Button type="button" variant="ghost" onClick={clearSearch}>
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
          </form>
          <p className="text-xs text-gray-500 mt-2">
            The text is turned into a vector and compared with every playbook by cosine distance
            (<code>ORDER BY vector &lt;=&gt; query LIMIT 5</code>).
          </p>
        </CardContent>
      </Card>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm" role="alert">
          {error}
        </div>
      )}

      {activeSearch && !loading && (
        <p className="text-sm text-gray-600">
          Top {playbooks.length} matches for <span className="font-medium">&ldquo;{activeSearch}&rdquo;</span>
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : playbooks.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            <BookOpen className="h-10 w-10 mx-auto mb-3 text-gray-400" />
            No playbooks found.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {playbooks.map((pb) => (
            <Card key={pb.playbook_id}>
              <CardContent className="p-5">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900">{pb.title}</h3>
                      {pb.similarity !== undefined && (
                        <Badge variant="info">{(pb.similarity * 100).toFixed(1)}% match</Badge>
                      )}
                      {pb.threat_category && <Badge variant="secondary">{pb.threat_category}</Badge>}
                    </div>
                    <p className="text-sm text-gray-600">{pb.description}</p>
                    {pb.tags && pb.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {pb.tags.map((t) => (
                          <span key={t} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                    {expanded === pb.playbook_id && (
                      <div className="bg-gray-50 rounded p-3 text-sm mt-3">
                        <p className="font-medium text-gray-900 mb-1">Mitigation steps</p>
                        <p className="text-gray-700 whitespace-pre-wrap">{pb.mitigation}</p>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpanded(expanded === pb.playbook_id ? null : pb.playbook_id)}
                    >
                      {expanded === pb.playbook_id ? 'Hide steps' : 'Show steps'}
                    </Button>
                    {canEdit && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(pb)}
                          aria-label={`Edit ${pb.title}`}
                          className="text-gray-600 hover:text-blue-600"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleting(pb)}
                          aria-label={`Delete ${pb.title}`}
                          className="text-gray-600 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Playbook' : 'Add Playbook'}
        description={
          editing
            ? 'Saving re-computes the vector from the new text.'
            : 'The vector is computed from the title, category, description, mitigation and tags.'
        }
        size="lg"
      >
        <form onSubmit={save} className="space-y-4">
          <Input
            label="Title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            required
          />
          <Input
            label="Threat category"
            placeholder="e.g. Credential Access"
            value={form.threat_category}
            onChange={(e) => setForm((f) => ({ ...f, threat_category: e.target.value }))}
          />
          <div>
            <label htmlFor="pb-description" className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              id="pb-description"
              rows={3}
              className={textareaClass}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              required
            />
          </div>
          <div>
            <label htmlFor="pb-mitigation" className="block text-sm font-medium text-gray-700 mb-1">
              Mitigation steps
            </label>
            <textarea
              id="pb-mitigation"
              rows={6}
              className={textareaClass}
              value={form.mitigation}
              onChange={(e) => setForm((f) => ({ ...f, mitigation: e.target.value }))}
              required
            />
          </div>
          <Input
            label="Tags"
            placeholder="comma separated, e.g. brute-force, authentication"
            value={form.tags}
            onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
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
              {editing ? 'Save and re-embed' : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title="Delete Playbook"
        message={deleting ? `Delete "${deleting.title}" and its vector? This cannot be undone.` : ''}
        confirmText="Delete"
        variant="danger"
      />
    </div>
  );
}
