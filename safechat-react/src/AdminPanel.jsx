import { useState, useEffect, useCallback } from 'react';
import { XMarkIcon, CheckCircleIcon, TrashIcon, ExclamationTriangleIcon, ArrowLeftIcon, ArrowRightOnRectangleIcon } from '@heroicons/react/24/outline';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

const api = {
  getPendingReports: async () => {
    const res = await fetch(`${API_BASE_URL}/message_reports/pending`);
    const data = await res.json();
    if (!res.ok) throw new Error(data?.detail || 'Failed to fetch reports');
    return data;
  },
  resolveReport: async (reportId, reviewerUsername) => {
    const res = await fetch(`${API_BASE_URL}/message_reports/${reportId}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewed_by_username: reviewerUsername }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.detail || 'Failed to resolve report');
    return data;
  },
  dismissReport: async (reportId, reviewerUsername) => {
    const res = await fetch(`${API_BASE_URL}/message_reports/${reportId}/dismiss`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewed_by_username: reviewerUsername }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.detail || 'Failed to dismiss report');
    return data;
  },
};

function ReportStatusBadge({ status, reason }) {
  const statusColors = {
    pending: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30',
    resolved: 'bg-green-500/10 text-green-300 border-green-500/30',
    dismissed: 'bg-gray-500/10 text-gray-300 border-gray-500/30',
  };

  const reasonLabels = {
    spam: '🚫 Spam',
    harassment: '😠 Harassment',
    hate: '🤐 Hate Speech',
    scam: '⚠️ Scam',
    other: '❓ Other',
  };

  return (
    <div className="flex items-center gap-2">
      <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusColors[status] || statusColors.pending}`}>
        {status?.charAt(0).toUpperCase() + status?.slice(1)}
      </span>
      <span className="rounded-full bg-neutral-800 px-3 py-1 text-xs font-medium text-neutral-300 border border-neutral-700">
        {reasonLabels[reason] || reason}
      </span>
    </div>
  );
}

function ReportCard({ report, onResolve, onDismiss, isProcessing, currentUser }) {
  const [expanded, setExpanded] = useState(false);

  const formatDate = (dateString) => {
    try {
      return new Date(dateString).toLocaleString([], {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  return (
    <div className="rounded-xl border border-neutral-800/60 bg-neutral-900 p-5 shadow-lg transition hover:border-neutral-700">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between">
        <div className="flex-1">
          <div className="mb-2 flex items-center gap-3">
            <ExclamationTriangleIcon className="h-5 w-5 text-red-400" />
            <h3 className="text-sm font-semibold text-white">
              Report #{report.report_id}
            </h3>
            <span className="text-xs text-gray-500">
              {formatDate(report.created_at)}
            </span>
          </div>
          <ReportStatusBadge status={report.status} reason={report.reason} />
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="rounded-lg p-1.5 text-gray-500 transition hover:bg-white/5 hover:text-gray-300"
        >
          <ExclamationTriangleIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Report Details */}
      <div className="mb-4 space-y-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Reporter → Reported User</p>
          <p className="mt-1 flex items-center gap-2 text-sm text-gray-100">
            <span className="inline-block h-6 w-6 rounded-full bg-green-500/20 text-center text-xs leading-6 text-green-400">
              {report.reporter_username?.[0]?.toUpperCase()}
            </span>
            <span className="font-semibold">{report.reporter_username}</span>
            <span className="text-gray-500">→</span>
            <span className="inline-block h-6 w-6 rounded-full bg-red-500/20 text-center text-xs leading-6 text-red-400">
              {report.reported_username?.[0]?.toUpperCase()}
            </span>
            <span className="font-semibold">{report.reported_username}</span>
          </p>
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Message Content</p>
          <div className="mt-2 rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-sm text-gray-200">
            <p className="break-words leading-relaxed">"{report.message_text || '[Message deleted]'}"</p>
          </div>
        </div>

        {report.description && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Reporter's Description</p>
            <div className="mt-2 rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-sm text-gray-300">
              <p className="break-words leading-relaxed">{report.description}</p>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      {report.status === 'pending' && (
        <div className="flex gap-2 border-t border-neutral-800 pt-4">
          <button
            onClick={() => onResolve(report.report_id)}
            disabled={isProcessing}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-green-500/10 px-3 py-2 text-sm font-semibold text-green-400 ring-1 ring-green-500/30 transition hover:bg-green-500 hover:ring-transparent hover:text-black disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckCircleIcon className="h-4 w-4" />
            {isProcessing ? 'Processing...' : 'Resolve'}
          </button>
          <button
            onClick={() => onDismiss(report.report_id)}
            disabled={isProcessing}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-gray-500/10 px-3 py-2 text-sm font-semibold text-gray-300 ring-1 ring-gray-500/30 transition hover:bg-gray-500 hover:ring-transparent hover:text-black disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <TrashIcon className="h-4 w-4" />
            {isProcessing ? 'Processing...' : 'Dismiss'}
          </button>
        </div>
      )}

      {report.status !== 'pending' && (
        <div className="border-t border-neutral-800 pt-4">
          <p className="text-xs text-gray-500">
            <span className="font-semibold capitalize text-gray-400">{report.status}</span> by{' '}
            <span className="text-gray-300">{report.reviewed_by || 'Unknown'}</span>
            {report.reviewed_at && (
              <>
                {' '}on <span className="text-gray-300">{formatDate(report.reviewed_at)}</span></>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

export default function AdminPanel({ user, onClose, onNavigateToHome, onLogout, showNotification }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingReportId, setProcessingReportId] = useState(null);
  const [filterStatus, setFilterStatus] = useState('pending');

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getPendingReports();
      setReports(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch reports:', error);
      showNotification(`Error: ${error.message}`);
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    fetchReports();
    const interval = setInterval(fetchReports, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, [fetchReports]);

  const handleResolve = async (reportId) => {
    setProcessingReportId(reportId);
    try {
      await api.resolveReport(reportId, user);
      showNotification('Report resolved successfully.');
      fetchReports();
    } catch (error) {
      console.error('Failed to resolve report:', error);
      showNotification(`Error: ${error.message}`);
    } finally {
      setProcessingReportId(null);
    }
  };

  const handleDismiss = async (reportId) => {
    setProcessingReportId(reportId);
    try {
      await api.dismissReport(reportId, user);
      showNotification('Report dismissed.');
      fetchReports();
    } catch (error) {
      console.error('Failed to dismiss report:', error);
      showNotification(`Error: ${error.message}`);
    } finally {
      setProcessingReportId(null);
    }
  };

  const pendingReports = reports.filter((r) => r.status === 'pending');
  const resolvedReports = reports.filter((r) => r.status === 'resolved');
  const dismissedReports = reports.filter((r) => r.status === 'dismissed');

  const displayedReports =
    filterStatus === 'pending'
      ? pendingReports
      : filterStatus === 'resolved'
        ? resolvedReports
        : dismissedReports;

  return (
    <div className="relative min-h-screen bg-neutral-950 text-gray-200">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-neutral-800/60 bg-neutral-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Message Reports</h1>
            <p className="mt-1 text-sm text-gray-400">Review and manage user-reported messages</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchReports}
              className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm font-semibold text-green-400 transition hover:bg-green-500 hover:text-black disabled:opacity-50"
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
            <button
              onClick={onNavigateToHome}
              className="rounded-lg border border-neutral-700 px-4 py-2 text-sm font-semibold text-gray-300 transition hover:bg-white/5 flex items-center gap-2"
            >
              <ArrowLeftIcon className="h-4 w-4" />
              Back
            </button>
            <button
              onClick={onLogout}
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-400 transition hover:bg-red-500 hover:text-white flex items-center gap-2"
            >
              <ArrowRightOnRectangleIcon className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="border-t border-neutral-800/60 bg-neutral-900/50 px-6 py-3">
          <div className="flex gap-4">
            {[
              { key: 'pending', label: `Pending (${pendingReports.length})`, color: 'yellow' },
              { key: 'resolved', label: `Resolved (${resolvedReports.length})`, color: 'green' },
              { key: 'dismissed', label: `Dismissed (${dismissedReports.length})`, color: 'gray' },
            ].map(({ key, label, color }) => (
              <button
                key={key}
                onClick={() => setFilterStatus(key)}
                className={`px-4 py-2 text-sm font-semibold transition ${
                  filterStatus === key
                    ? `bg-${color}-500/10 text-${color}-400 border-b-2 border-${color}-500`
                    : `text-gray-400 hover:text-gray-200`
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-6xl px-6 py-8">
        {loading && displayedReports.length === 0 ? (
          <div className="flex h-64 items-center justify-center">
            <div className="text-center">
              <div className="mb-2 h-12 w-12 animate-spin rounded-full border-4 border-neutral-700 border-t-green-500 mx-auto" />
              <p className="text-gray-400">Loading reports...</p>
            </div>
          </div>
        ) : displayedReports.length === 0 ? (
          <div className="flex h-64 items-center justify-center rounded-xl border-2 border-dashed border-neutral-800 bg-neutral-900/50">
            <div className="text-center">
              <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-neutral-600 mb-2" />
              <p className="text-gray-400">
                {filterStatus === 'pending'
                  ? 'No pending reports. Inbox clear!'
                  : `No ${filterStatus} reports.`}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4">
            {displayedReports.map((report) => (
              <ReportCard
                key={report.report_id}
                report={report}
                onResolve={handleResolve}
                onDismiss={handleDismiss}
                isProcessing={processingReportId === report.report_id}
                currentUser={user}
              />
            ))}
          </div>
        )}
      </main>

      {/* Stats Footer */}
      {reports.length > 0 && (
        <footer className="border-t border-neutral-800 bg-neutral-950 px-6 py-4">
          <div className="mx-auto max-w-6xl">
            <div className="flex items-center justify-between text-sm">
              <p className="text-gray-400">
                Total reports: <span className="font-semibold text-white">{reports.length}</span>
              </p>
              <p className="text-gray-400">
                Pending: <span className="font-semibold text-yellow-400">{pendingReports.length}</span>
                {' | '}Resolved: <span className="font-semibold text-green-400">{resolvedReports.length}</span>
                {' | '}Dismissed: <span className="font-semibold text-gray-400">{dismissedReports.length}</span>
              </p>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
