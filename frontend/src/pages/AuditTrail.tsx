import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { api, buildDemoAuditDetail } from '../api/client'
import type { AuditDetailResponse, AuditLogDoc } from '../api/client'
import { useAuditLogs } from '../api/hooks'
import { csvEscape, downloadTextFile, formatCurrency, formatDateTime, shortenAddress } from '../lib/format'
import './AuditTrail.css'

type DetailState = {
  loading: boolean
  data: AuditDetailResponse | null
  error: string | null
}

function StatusPill({ status }: { status: AuditLogDoc['status'] }) {
  return <span className={`data-badge data-badge-${status}`}>{status}</span>
}

function explorerUrl(signature: string) {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`
}

export default function AuditTrail() {
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<'all' | AuditLogDoc['status']>('all')
  const [query, setQuery] = useState('')
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null)
  const [details, setDetails] = useState<Record<string, DetailState>>({})
  const deferredQuery = useDeferredValue(query.trim().toLowerCase())

  const { audits, pagination, loading, isLive, error } = useAuditLogs(page, 10)

  const filteredAudits = useMemo(() => {
    return audits.filter((audit) => {
      const matchesStatus = statusFilter === 'all' ? true : audit.status === statusFilter
      const amount = String(audit.inputSnapshot.amount ?? '')
      const haystack = [
        audit.auditId,
        audit.decisionId,
        audit.onChainTxSig,
        amount,
      ]
        .join(' ')
        .toLowerCase()

      const matchesQuery = deferredQuery ? haystack.includes(deferredQuery) : true
      return matchesStatus && matchesQuery
    })
  }, [audits, deferredQuery, statusFilter])

  const selectedAudit =
    filteredAudits.find((audit) => audit.auditId === selectedAuditId) ?? filteredAudits[0] ?? null

  const effectiveSelectedAuditId = selectedAudit?.auditId ?? null
  const selectedDetail = effectiveSelectedAuditId ? details[effectiveSelectedAuditId] : null
  const detailLoading =
    Boolean(selectedAudit) && (!selectedDetail || selectedDetail.loading)

  useEffect(() => {
    if (
      !effectiveSelectedAuditId ||
      selectedDetail?.data ||
      selectedDetail?.loading ||
      selectedDetail?.error
    ) {
      return
    }

    let active = true

    setDetails((current) => ({
      ...current,
      [effectiveSelectedAuditId]: {
        loading: true,
        data: current[effectiveSelectedAuditId]?.data ?? null,
        error: null,
      },
    }))

    const loadDetail = async () => {
      try {
        const result = isLive
          ? await api.getAuditLog(effectiveSelectedAuditId)
          : buildDemoAuditDetail(effectiveSelectedAuditId)

        if (!active) return

        setDetails((current) => ({
          ...current,
          [effectiveSelectedAuditId]: {
            loading: false,
            data: result,
            error: result ? null : 'Audit detail is unavailable for this row.',
          },
        }))
      } catch (loadError) {
        if (!active) return
        setDetails((current) => ({
          ...current,
          [effectiveSelectedAuditId]: {
            loading: false,
            data: null,
            error:
              loadError instanceof Error
                ? loadError.message
                : 'Unable to load the audit detail.',
          },
        }))
      }
    }

    void loadDetail()

    return () => {
      active = false
    }
  }, [effectiveSelectedAuditId, isLive, selectedDetail])

  const summary = useMemo(() => {
    const confirmed = filteredAudits.filter((audit) => audit.status === 'confirmed').length
    const failed = filteredAudits.filter((audit) => audit.status === 'failed').length
    const pending = filteredAudits.filter(
      (audit) => audit.status === 'pending' || audit.status === 'submitted',
    ).length
    const volume = filteredAudits.reduce((sum, audit) => {
      return sum + Number(audit.inputSnapshot.amount ?? 0)
    }, 0)

    return { confirmed, failed, pending, volume }
  }, [filteredAudits])

  const exportCsv = () => {
    const rows = [
      ['Audit ID', 'Decision ID', 'Status', 'Amount', 'Tx Signature', 'Created At'],
      ...filteredAudits.map((audit) => [
        audit.auditId,
        audit.decisionId,
        audit.status,
        String(audit.inputSnapshot.amount ?? ''),
        audit.onChainTxSig,
        audit.createdAt,
      ]),
    ]
    const content = rows.map((row) => row.map(csvEscape).join(',')).join('\n')
    downloadTextFile('policypay-audit.csv', content)
  }

  const enrichSelected = async () => {
    if (!selectedAudit || !selectedAudit.onChainTxSig || !isLive) return

    setDetails((current) => ({
      ...current,
      [selectedAudit.auditId]: { loading: true, data: current[selectedAudit.auditId]?.data ?? null, error: null },
    }))

    try {
      await api.enrichAudit(selectedAudit.auditId)
      const refreshed = await api.getAuditLog(selectedAudit.auditId)
      setDetails((current) => ({
        ...current,
        [selectedAudit.auditId]: { loading: false, data: refreshed, error: null },
      }))
    } catch (enrichError) {
      setDetails((current) => ({
        ...current,
        [selectedAudit.auditId]: {
          loading: false,
          data: current[selectedAudit.auditId]?.data ?? null,
          error:
            enrichError instanceof Error
              ? enrichError.message
              : 'Unable to enrich the selected audit.',
        },
      }))
    }
  }

  return (
    <div className="page-shell audit-page">
      <section className="metric-band">
        <article className="metric-band-item">
          <span className="metric-band-label">Confirmed</span>
          <strong>{summary.confirmed}</strong>
          <p>Current filtered page</p>
        </article>
        <article className="metric-band-item">
          <span className="metric-band-label">Pending</span>
          <strong>{summary.pending}</strong>
          <p>Still waiting on settlement or reconciliation</p>
        </article>
        <article className="metric-band-item">
          <span className="metric-band-label">Failed</span>
          <strong>{summary.failed}</strong>
          <p>Rejected at policy or execution stage</p>
        </article>
        <article className="metric-band-item">
          <span className="metric-band-label">Volume in view</span>
          <strong>{formatCurrency(summary.volume, true)}</strong>
          <p>{isLive ? 'Live audit page' : 'Demo audit page'}</p>
        </article>
      </section>

      {(error || selectedDetail?.error) && (
        <div className="notice-banner">
          <span className="notice-banner-title">Audit note</span>
          <span>{selectedDetail?.error ?? error}</span>
        </div>
      )}

      <div className="audit-layout">
        <section className="surface-panel audit-list-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Search and filter</span>
              <h3>Audit stream</h3>
            </div>
            <button type="button" className="button button-ghost button-small" onClick={exportCsv}>
              Export CSV
            </button>
          </div>

          <div className="audit-toolbar">
            <label className="field audit-search">
              <span className="label">Search</span>
              <input
                className="input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Audit ID, decision ID, amount, or tx signature"
              />
            </label>
            <div className="filter-pills">
              {(['all', 'confirmed', 'failed', 'pending', 'submitted'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  className={`filter-pill${statusFilter === status ? ' filter-pill-active' : ''}`}
                  onClick={() => setStatusFilter(status)}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="empty-panel">
              <h4>Loading audit stream</h4>
              <p>Fetching the latest records and stitching the current page together.</p>
            </div>
          ) : filteredAudits.length === 0 ? (
            <div className="empty-panel">
              <h4>No audit rows match</h4>
              <p>Adjust the search or status filter to widen the current evidence set.</p>
            </div>
          ) : (
            <div className="audit-list">
              {filteredAudits.map((audit) => (
                <button
                  key={audit.auditId}
                  type="button"
                  className={`audit-row${selectedAudit?.auditId === audit.auditId ? ' audit-row-selected' : ''}`}
                  onClick={() => setSelectedAuditId(audit.auditId)}
                >
                  <div className="audit-row-main">
                    <div>
                      <p className="data-row-title">{audit.auditId}</p>
                      <p className="data-row-subtitle">{audit.decisionId}</p>
                    </div>
                    <div className="audit-row-copy">
                      <span>{formatCurrency(Number(audit.inputSnapshot.amount ?? 0))}</span>
                      <span>{formatDateTime(audit.createdAt)}</span>
                    </div>
                  </div>
                  <div className="audit-row-meta">
                    <StatusPill status={audit.status} />
                    <span className="mono subtle-text">
                      {audit.onChainTxSig
                        ? shortenAddress(audit.onChainTxSig, 8, 6)
                        : 'No signature'}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="pagination-row">
            <span className="subtle-text">
              Page {pagination.page} of {pagination.pages} | {pagination.total} records
            </span>
            <div className="panel-actions">
              <button
                type="button"
                className="button button-ghost button-small"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className="button button-ghost button-small"
                disabled={page >= pagination.pages}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </section>

        <section className="surface-panel audit-detail-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Selected evidence</span>
              <h3>{selectedAudit ? selectedAudit.auditId : 'No audit selected'}</h3>
            </div>
            {selectedAudit && <StatusPill status={selectedAudit.status} />}
          </div>

          {!selectedAudit ? (
            <div className="empty-panel">
              <h4>Select an audit row</h4>
              <p>The inspector will load the audit detail, decision record, and event payload here.</p>
            </div>
          ) : detailLoading ? (
            <div className="empty-panel">
              <h4>Loading audit evidence</h4>
              <p>Resolving the selected audit and its associated decision record.</p>
            </div>
          ) : (
            <div className="detail-stack">
              <div className="detail-grid">
                <article className="detail-tile">
                  <span className="data-label">Amount</span>
                  <strong>{formatCurrency(Number(selectedAudit.inputSnapshot.amount ?? 0))}</strong>
                </article>
                <article className="detail-tile">
                  <span className="data-label">Created</span>
                  <strong>{formatDateTime(selectedAudit.createdAt)}</strong>
                </article>
                <article className="detail-tile">
                  <span className="data-label">Decision ID</span>
                  <strong>{selectedAudit.decisionId}</strong>
                </article>
                <article className="detail-tile">
                  <span className="data-label">Transaction signature</span>
                  <strong className="mono">
                    {selectedAudit.onChainTxSig ? selectedAudit.onChainTxSig : 'Not available'}
                  </strong>
                </article>
              </div>

              {selectedDetail?.data?.decision && (
                <div className="detail-block">
                  <span className="data-label">Decision summary</span>
                  <div className="detail-grid">
                    <article className="detail-tile">
                      <span className="data-label">Institution</span>
                      <strong>{selectedDetail.data.decision.institutionId}</strong>
                    </article>
                    <article className="detail-tile">
                      <span className="data-label">Policy</span>
                      <strong>
                        POL-{String(selectedDetail.data.decision.policyId).padStart(3, '0')}
                      </strong>
                    </article>
                    <article className="detail-tile">
                      <span className="data-label">AML score</span>
                      <strong>{selectedDetail.data.decision.amlScore}</strong>
                    </article>
                    <article className="detail-tile">
                      <span className="data-label">Verdict</span>
                      <strong>
                        {selectedDetail.data.decision.allowed ? 'Allowed' : 'Blocked'}
                      </strong>
                    </article>
                  </div>
                </div>
              )}

              <div className="detail-block">
                <span className="data-label">Input snapshot</span>
                <pre className="code-block">
                  {JSON.stringify(selectedAudit.inputSnapshot, null, 2)}
                </pre>
              </div>

              {selectedDetail?.data?.audit.eventData && (
                <div className="detail-block">
                  <span className="data-label">Event payload</span>
                  <pre className="code-block">
                    {JSON.stringify(selectedDetail.data.audit.eventData, null, 2)}
                  </pre>
                </div>
              )}

              <div className="panel-actions">
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={enrichSelected}
                  disabled={!selectedAudit.onChainTxSig || !isLive}
                >
                  Enrich from chain
                </button>
                <a
                  className={`button button-ghost${selectedAudit.onChainTxSig ? '' : ' button-disabled'}`}
                  href={selectedAudit.onChainTxSig ? explorerUrl(selectedAudit.onChainTxSig) : undefined}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open in explorer
                </a>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
