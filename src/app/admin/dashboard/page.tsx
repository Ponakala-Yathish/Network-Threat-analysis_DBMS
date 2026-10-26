export const dynamic = 'force-dynamic';

import { getSystemStats } from '@/lib/queries';
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
  const stats = await getSystemStats();

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
              <a href="/admin/audit-logs" className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors">
                <h3 className="font-medium text-gray-900">View Audit Logs</h3>
                <p className="text-sm text-gray-500 mt-1">Review all analyst resolution actions</p>
              </a>
              <a href="/admin/users" className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors">
                <h3 className="font-medium text-gray-900">Manage Users</h3>
                <p className="text-sm text-gray-500 mt-1">Add or remove analyst accounts</p>
              </a>
              <a href="/analyst/incidents" className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors">
                <h3 className="font-medium text-gray-900">Incident Queue</h3>
                <p className="text-sm text-gray-500 mt-1">View active incidents (Analyst view)</p>
              </a>
              <a href="/analyst/traffic-logs" className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors">
                <h3 className="font-medium text-gray-900">Traffic Analysis</h3>
                <p className="text-sm text-gray-500 mt-1">Search and filter network traffic logs</p>
              </a>
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
    </div>
  );
}