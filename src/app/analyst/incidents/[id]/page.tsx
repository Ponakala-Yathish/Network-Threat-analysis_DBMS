'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { format } from 'date-fns';
import { AlertTriangle, Shield, Server, Network, Target, Copy, CheckCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';

interface IncidentDetail {
  incident_id: number;
  attacker_ip: string;
  target_id: number;
  target_ip: string;
  target_hostname: string | null;
  asset_criticality: number;
  asset_department: string | null;
  status: 'Active' | 'Resolved';
  description: string | null;
  blast_radius_score: number;
  created_at: string;
  resolved_at: string | null;
  resolved_by: number | null;
}

interface BlastRadius {
  affected_asset_count: number;
  max_criticality: number;
  risk_score: number;
}

interface Playbook {
  playbook_id: number;
  title: string;
  threat_category: string | null;
  description: string;
  mitigation: string;
  similarity: number;
}

export default function IncidentDetailPage() {
  const params = useParams();
  const incidentId = parseInt(params.id as string);

  const [incident, setIncident] = useState<IncidentDetail | null>(null);
  const [blastRadius, setBlastRadius] = useState<BlastRadius | null>(null);
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [resolveModalOpen, setResolveModalOpen] = useState(false);
  const [resolveNotes, setResolveNotes] = useState('');
  const [error, setError] = useState('');

  const fetchIncident = async () => {
    setLoading(true);
    setError('');
    try {
      const [incidentRes, blastRes, playbooksRes] = await Promise.all([
        fetch(`/api/incidents/${incidentId}`),
        fetch(`/api/blast-radius/${incidentId}`),
        fetch(`/api/incidents/${incidentId}/playbooks`),
      ]);

      if (!incidentRes.ok) throw new Error('Failed to fetch incident');

      const incidentData = await incidentRes.json();
      setIncident(incidentData);

      if (blastRes.ok) {
        const blastData = await blastRes.json();
        setBlastRadius(blastData);
      }

      if (playbooksRes.ok) {
        const playbooksData = await playbooksRes.json();
        setPlaybooks(playbooksData);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async () => {
    setResolving(true);
    try {
      const res = await fetch(`/api/incidents/${incidentId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: resolveNotes }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to resolve incident');
      }

      setResolveModalOpen(false);
      setResolveNotes('');
      fetchIncident();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setResolving(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (error || !incident) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-gray-900">Unable to load incident</h2>
        <p className="text-gray-500 mt-2">{error || 'Incident not found'}</p>
        <Button variant="outline" onClick={fetchIncident} className="mt-4">
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  const isResolved = incident.status === 'Resolved';

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Incident #{incident.incident_id}</h1>
            <Badge variant={isResolved ? 'success' : 'warning'} className="text-base px-3 py-1">
              {incident.status}
            </Badge>
          </div>
          <p className="text-gray-500 mt-1">Created: {format(new Date(incident.created_at), 'MMMM dd, yyyy HH:mm:ss')}</p>
        </div>
        {!isResolved && (
          <Button onClick={() => setResolveModalOpen(true)} variant="danger" size="lg">
            <CheckCircle className="h-4 w-4 mr-2" />
            Resolve Incident
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-red-600" />
                Incident Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-gray-500">Attacker IP</label>
                  <p className="font-mono text-lg font-medium mt-1">{incident.attacker_ip}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Target Asset</label>
                  <p className="font-mono text-lg font-medium mt-1">{incident.target_ip}</p>
                  {incident.target_hostname && (
                    <p className="text-xs text-gray-500">{incident.target_hostname}</p>
                  )}
                </div>
                <div>
                  <label className="text-sm text-gray-500">Department</label>
                  <p className="font-medium mt-1">{incident.asset_department || 'Unknown'}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Asset Criticality</label>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant={incident.asset_criticality >= 8 ? 'danger' : incident.asset_criticality >= 5 ? 'warning' : 'success'}>
                      {incident.asset_criticality}/10
                    </Badge>
                    <span className="text-sm text-gray-500">Blast Radius Score: {incident.blast_radius_score}</span>
                  </div>
                </div>
              </div>

              {incident.description && (
                <div className="pt-4 border-t border-gray-200">
                  <label className="text-sm text-gray-500">Description</label>
                  <p className="mt-2 p-4 bg-gray-50 rounded-lg text-gray-900 whitespace-pre-wrap">{incident.description}</p>
                </div>
              )}

              {isResolved && (
                <div className="pt-4 border-t border-gray-200 bg-green-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-green-800">
                    <CheckCircle className="h-5 w-5" />
                    <span className="font-medium">Incident Resolved</span>
                  </div>
                  <p className="text-sm text-green-700 mt-1">
                    Resolved on {format(new Date(incident.resolved_at!), 'MMMM dd, yyyy HH:mm:ss')}
                    {incident.resolved_by && ` by user #${incident.resolved_by}`}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {blastRadius && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-purple-600" />
                  Blast Radius Analysis
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 bg-purple-50 rounded-lg">
                    <p className="text-sm text-purple-600">Affected Assets</p>
                    <p className="text-2xl font-bold text-purple-900">{blastRadius.affected_asset_count}</p>
                  </div>
                  <div className="p-4 bg-purple-50 rounded-lg">
                    <p className="text-sm text-purple-600">Max Criticality</p>
                    <p className="text-2xl font-bold text-purple-900">{blastRadius.max_criticality}/10</p>
                  </div>
                  <div className="p-4 bg-purple-50 rounded-lg">
                    <p className="text-sm text-purple-600">Risk Score</p>
                    <p className="text-2xl font-bold text-purple-900">{blastRadius.risk_score.toFixed(1)}</p>
                  </div>
                </div>
                <p className="text-sm text-gray-500 mt-4">
                  Risk score calculated as: Sum of criticalities x ln(affected assets + 1)
                </p>
              </CardContent>
            </Card>
          )}

          {playbooks.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Network className="h-5 w-5 text-blue-600" />
                  Recommended Mitigation Playbooks
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-500 mb-4">
                  Top {playbooks.length} semantically similar playbooks based on incident description
                </p>
                <div className="space-y-4">
                  {playbooks.map((playbook) => (
                    <div key={playbook.playbook_id} className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h4 className="font-semibold text-gray-900">{playbook.title}</h4>
                            <Badge variant="info" className="text-xs">
                              {(playbook.similarity * 100).toFixed(1)}% Match
                            </Badge>
                            {playbook.threat_category && (
                              <Badge variant="secondary" className="text-xs">
                                {playbook.threat_category}
                              </Badge>
                            )}
                          </div>
                          <p className="text-gray-600 text-sm mb-2">{playbook.description}</p>
                          <div className="bg-gray-50 rounded p-3 text-sm">
                            <p className="font-medium text-gray-900 mb-1">Mitigation Steps:</p>
                            <p className="text-gray-700 whitespace-pre-wrap">{playbook.mitigation}</p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(playbook.mitigation)}
                          className="self-start"
                        >
                          <Copy className="h-4 w-4 mr-1" />
                          Copy
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {playbooks.length === 0 && incident.description && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Network className="h-5 w-5 text-blue-600" />
                  Recommended Mitigation Playbooks
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-500 text-center py-4">
                  No semantically similar playbooks found for this incident description.
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5 text-green-600" />
                Target Asset Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-sm text-gray-500">IP Address</label>
                <p className="font-mono font-medium">{incident.target_ip}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500">Hostname</label>
                <p className="font-medium">{incident.target_hostname || 'Not set'}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500">Department</label>
                <p className="font-medium">{incident.asset_department || 'Not assigned'}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500">Criticality</label>
                <Badge variant={incident.asset_criticality >= 8 ? 'danger' : incident.asset_criticality >= 5 ? 'warning' : 'success'}>
                  {incident.asset_criticality}/10
                </Badge>
              </div>
              <div className="pt-3 border-t border-gray-200">
                <Button variant="outline" className="w-full" onClick={fetchIncident}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh Blast Radius
                </Button>
              </div>
            </CardContent>
          </Card>

          {!isResolved && (
            <Card className="border-red-200 bg-red-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-800">
                  <AlertTriangle className="h-5 w-5" />
                  Resolution Required
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-red-700 text-sm mb-4">
                  This incident is currently active. Please investigate and resolve when appropriate.
                  Resolution will update the incident status, decrement the asset criticality, and create an audit log entry.
                </p>
                <Button variant="danger" onClick={() => setResolveModalOpen(true)} className="w-full">
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Mark as Resolved
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Modal
        isOpen={resolveModalOpen}
        onClose={() => setResolveModalOpen(false)}
        title="Resolve Incident"
        description="This will mark the incident as resolved, decrement the target asset criticality, and create an audit log entry."
        size="md"
      >
        <div className="space-y-4">
          <Input
            label="Resolution Notes"
            placeholder="Describe the actions taken to resolve this incident..."
            value={resolveNotes}
            onChange={(e) => setResolveNotes(e.target.value)}
            helperText="Optional but recommended for audit trail"
          />
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="ghost" onClick={() => setResolveModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleResolve} loading={resolving}>
              <CheckCircle className="h-4 w-4 mr-2" />
              Confirm Resolution
            </Button>
          </div>
        </div>
</Modal>
    </div>
    );
}
