export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { format } from 'date-fns';
import { getSystemStats, getSecurityAnalytics } from '@/lib/queries';
import { ArchiveLogsCard } from '@/components/admin/ArchiveLogsCard';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import {
  ShieldAlert,
  CheckCircle,
  Activity,
  Users,
  AlertTriangle,
  TrendingUp,
} from 'lucide-react';

const statCards = [
  { label: 'Total Incidents', value: 'total_incidents', icon: ShieldAlert, color: 'text-blue-600', bg: 'bg-blue-50' },
  { label: 'Active Incidents', value: 'active_incidents', icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
  { label: 'Resolved Incidents', value: 'resolved_incidents', icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
  { label: 'Total Traffic Logs', value: 'total_traffic_logs', icon: Activity, color: 'text-purple-600', bg: 'bg-purple-50' },
  { label: 'Logs (Last Hour)', value: 'logs_last_hour', icon: TrendingUp, color: 'text-orange-600', bg: 'bg-orange-50' },
  { label: 'Unique Attackers', value: 'unique_attackers', icon: Users, color: 'text-indigo-600', bg: 'bg-indigo-50' },
  { label: 'Critical Assets', value: 'critical_assets', icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
];

export default async function AdminDashboardPage() {
  const [stats, analytics] = await Promise.all([getSystemStats(), getSecurityAnalytics()]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">System Overview</h1>
        <p className="text-gray-500 mt-1">Real-time system health and threat intelligence metrics</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          const value = stats[card.value as keyof typeof stats] ?? 0;
          return (
            <Card key={card.value} className="hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">{card.label}</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{value.toLocaleString()}</p>
                  </div>
                  <div className={`${card.bg} ${card.color} p-3 rounded-xl`}>
                    <Icon className="h-6 w-6" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Link href="/admin/audit-logs" className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors">
                <h3 className="font-medium text-gray-900">View Audit Logs</h3>
                <p className="text-sm text-gray-500 mt-1">Review all analyst resolution actions</p>
              </Link>
              <Link href="/admin/assets" className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors">
                <h3 className="font-medium text-gray-900">Network Assets</h3>
                <p className="text-sm text-gray-500 mt-1">Assets, connections and lateral-movement reach</p>
              </Link>
              <Link href="/admin/playbooks" className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors">
                <h3 className="font-medium text-gray-900">Security Playbooks</h3>
                <p className="text-sm text-gray-500 mt-1">Create, edit and search vector playbooks</p>
              </Link>
              <Link href="/admin/users" className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors">
                <h3 className="font-medium text-gray-900">Manage Users</h3>
                <p className="text-sm text-gray-500 mt-1">Add or remove analyst accounts</p>
              </Link>
              <Link href="/analyst/incidents" className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors">
                <h3 className="font-medium text-gray-900">Incident Queue</h3>
                <p className="text-sm text-gray-500 mt-1">View active incidents (Analyst view)</p>
              </Link>
              <Link href="/analyst/traffic-logs" className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors">
                <h3 className="font-medium text-gray-900">Traffic Analysis</h3>
                <p className="text-sm text-gray-500 mt-1">Search and filter network traffic logs</p>
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>System Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span className="font-medium text-green-800">Database Connection</span>
                </div>
                <Badge variant="success">Healthy</Badge>
              </div>
              <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span className="font-medium text-green-800">pgvector Extension</span>
                </div>
                <Badge variant="success">Enabled</Badge>
              </div>
              <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span className="font-medium text-green-800">Triggers Active</span>
                </div>
                <Badge variant="success">Running</Badge>
              </div>
              <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-yellow-500" />
                  <span className="font-medium text-yellow-800">Playbook Embeddings</span>
                </div>
                <Badge variant="warning">Partial</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <ArchiveLogsCard />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Top attacking sources</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <p className="px-6 pb-3 text-xs text-gray-500">
              GROUP BY attacker_ip HAVING at least 3 failed attempts
            </p>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-4 py-2 font-medium">Source IP</th>
                  <th className="px-4 py-2 font-medium">Failed</th>
                  <th className="px-4 py-2 font-medium">Total</th>
                  <th className="px-4 py-2 font-medium">Targets</th>
                  <th className="px-4 py-2 font-medium">Last seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {analytics.top_attackers.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-4 text-gray-500">No source has 3+ failed attempts.</td></tr>
                )}
                {analytics.top_attackers.map((a) => (
                  <tr key={a.attacker_ip}>
                    <td className="px-4 py-2 font-mono">{a.attacker_ip}</td>
                    <td className="px-4 py-2 font-semibold text-red-700">{a.failed_attempts}</td>
                    <td className="px-4 py-2">{a.total_attempts}</td>
                    <td className="px-4 py-2">{a.targets_hit}</td>
                    <td className="px-4 py-2 text-gray-600">{format(new Date(a.last_seen), 'MMM dd HH:mm')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Incidents by department</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <p className="px-6 pb-3 text-xs text-gray-500">Incidents JOIN Network_Assets, GROUP BY department</p>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-4 py-2 font-medium">Department</th>
                  <th className="px-4 py-2 font-medium">Total</th>
                  <th className="px-4 py-2 font-medium">Active</th>
                  <th className="px-4 py-2 font-medium">Resolved</th>
                  <th className="px-4 py-2 font-medium">Avg blast radius</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {analytics.incidents_by_department.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-4 text-gray-500">No incidents yet.</td></tr>
                )}
                {analytics.incidents_by_department.map((d) => (
                  <tr key={d.department}>
                    <td className="px-4 py-2 font-medium">{d.department}</td>
                    <td className="px-4 py-2">{d.total_incidents}</td>
                    <td className="px-4 py-2"><Badge variant={d.active_incidents > 0 ? 'danger' : 'secondary'}>{d.active_incidents}</Badge></td>
                    <td className="px-4 py-2">{d.resolved_incidents}</td>
                    <td className="px-4 py-2">{d.avg_blast_radius}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Attackers above their target&apos;s average</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <p className="px-6 pb-3 text-xs text-gray-500">
            Correlated subquery: each row is compared with the average failed attempts against the same target
          </p>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-4 py-2 font-medium">Source IP</th>
                <th className="px-4 py-2 font-medium">Target</th>
                <th className="px-4 py-2 font-medium">Failed attempts</th>
                <th className="px-4 py-2 font-medium">Target average</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {analytics.above_average_attackers.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-4 text-gray-500">No failed attempts recorded.</td></tr>
              )}
              {analytics.above_average_attackers.map((r) => (
                <tr key={`${r.attacker_ip}-${r.target_id}`}>
                  <td className="px-4 py-2 font-mono">{r.attacker_ip}</td>
                  <td className="px-4 py-2">{r.target_hostname || `asset #${r.target_id}`}</td>
                  <td className="px-4 py-2 font-semibold">{r.failed_attempts}</td>
                  <td className="px-4 py-2 text-gray-600">{r.target_avg_failed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
