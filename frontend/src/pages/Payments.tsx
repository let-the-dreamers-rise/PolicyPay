import { useState } from 'react'
import { api } from '../api/client'
import type {
  AttestationPreview,
  AuditLogDoc,
  PartnerMeta,
  PolicyDoc,
  RoutePreviewResponse,
} from '../api/client'
import { useAuditLogs, useBackendStatus, usePolicies } from '../api/hooks'
import { COUNTRY_OPTIONS, getCountryLabel, normalizeBlockedCountries } from '../lib/referenceData'
import {
  formatCurrency,
  formatDateTime,
  formatRelativeTime,
  shortenAddress,
} from '../lib/format'
import './Payments.css'

type SettlementMode = 'direct' | 'orchestrated'

interface DecisionCheck {
  label: string
  detail: string
  passed: boolean
}

interface DecisionPreview {
  source: 'live' | 'demo'
  mode: SettlementMode
  allowed: boolean
  reason: string
  decisionId: string
  payloadHash?: string | null
  route?: RoutePreviewResponse['route'] | null
  partnerMeta?: PartnerMeta | null
  attestationPreview?: AttestationPreview
  checks: DecisionCheck[]
}

interface ExecutionState {
  loading: boolean
  source?: 'live' | 'demo'
  txSignature?: string
  auditId?: string
  error?: string | null
}

const DEFAULT_SENDER_VASP_ID = '11'.repeat(32)
const DEFAULT_RECEIVER_VASP_ID = '22'.repeat(32)

function buildChecks(
  policy: PolicyDoc,
  amount: number,
  senderCountry: number,
  receiverCountry: number,
  attestation: {
    kycVerified: boolean
    amlScore: number
    travelRuleFieldsPresent: boolean
  },
): DecisionCheck[] {
  const blockedCountries = normalizeBlockedCountries(policy.blockedCountries)
  const blocked =
    blockedCountries.includes(senderCountry) || blockedCountries.includes(receiverCountry)
  const travelRuleSatisfied =
    !policy.travelRuleRequired ||
    amount < policy.travelRuleRequiredAmount ||
    attestation.travelRuleFieldsPresent

  return [
    {
      label: 'Policy ceiling',
      detail: `${formatCurrency(amount)} against ${formatCurrency(policy.maxAmount)}`,
      passed: amount <= policy.maxAmount,
    },
    {
      label: 'KYC requirement',
      detail: policy.requireKyc
        ? attestation.kycVerified
          ? 'Required and satisfied'
          : 'Required and missing'
        : 'Policy does not require KYC',
      passed: !policy.requireKyc || attestation.kycVerified,
    },
    {
      label: 'AML threshold',
      detail: `Score ${attestation.amlScore} against threshold ${policy.amlThreshold}`,
      passed: attestation.amlScore <= policy.amlThreshold,
    },
    {
      label: 'Jurisdiction screening',
      detail: blocked
        ? `Blocked corridor between ${getCountryLabel(senderCountry)} and ${getCountryLabel(receiverCountry)}`
        : `Sender ${getCountryLabel(senderCountry)} and receiver ${getCountryLabel(receiverCountry)} are allowed`,
      passed: !blocked,
    },
    {
      label: 'Travel rule',
      detail: policy.travelRuleRequired
        ? amount >= policy.travelRuleRequiredAmount
          ? attestation.travelRuleFieldsPresent
            ? 'Threshold met and data supplied'
            : 'Threshold met but data missing'
          : 'Below trigger threshold'
        : 'Travel rule not required by this policy',
      passed: travelRuleSatisfied,
    },
  ]
}

function buildReason(checks: DecisionCheck[]): string {
  const failed = checks.find((check) => !check.passed)
  return failed ? failed.detail : 'All policy conditions passed.'
}

function buildDemoRoute(
  policy: PolicyDoc,
  senderCountry: number,
  receiverCountry: number,
): RoutePreviewResponse['route'] {
  return {
    routeId: `ROUTE-${policy.policyId}-${senderCountry}-${receiverCountry}`,
    routeDescription: `${getCountryLabel(senderCountry)} -> Keyrock liquidity hop -> ${getCountryLabel(receiverCountry)}`,
    senderVaspId: DEFAULT_SENDER_VASP_ID,
    receiverVaspId: DEFAULT_RECEIVER_VASP_ID,
  }
}

function buildDemoPartnerSignals(policy: PolicyDoc, amount: number) {
  const amlScore = Math.min(79, Math.max(14, Math.round(amount / 4500)))

  return {
    attestationPreview: {
      kycVerified: true,
      amlScore,
      senderVaspId: DEFAULT_SENDER_VASP_ID,
      receiverVaspId: DEFAULT_RECEIVER_VASP_ID,
      travelRuleFieldsPresent:
        !policy.travelRuleRequired || amount < policy.travelRuleRequiredAmount || true,
      travelRulePayloadVersion: 1,
    },
    partnerMeta: {
      fxRiskLabel:
        amount > policy.maxAmount * 0.7 ? 'MEDIUM' : amount > policy.maxAmount * 0.45 ? 'LOW' : 'LOW',
    },
  }
}

function StatusPill({ status }: { status: AuditLogDoc['status'] }) {
  return <span className={`data-badge data-badge-${status}`}>{status}</span>
}

export default function Payments() {
  const backendStatus = useBackendStatus()
  const { policies, isLive: policiesLive, error: policyError } = usePolicies()
  const { audits } = useAuditLogs(1, 6)

  const [mode, setMode] = useState<SettlementMode>('direct')
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null)
  const [amount, setAmount] = useState('50000')
  const [senderPubkey, setSenderPubkey] = useState(
    'DgSaPQGgV5k1Bhjy5BwkjunYoEuDPJrno83MMfXMPw8j',
  )
  const [recipientPubkey, setRecipientPubkey] = useState(
    '9uPH8YLrrbsnNkKoAYCPp5o77m5rYXNeHsjActp7kmud',
  )
  const [senderCountry, setSenderCountry] = useState('1')
  const [receiverCountry, setReceiverCountry] = useState('2')
  const [kycVerified, setKycVerified] = useState(true)
  const [amlScore, setAmlScore] = useState(28)
  const [travelRuleFieldsPresent, setTravelRuleFieldsPresent] = useState(true)
  const [senderSecretKey, setSenderSecretKey] = useState('')
  const [senderVaspId, setSenderVaspId] = useState(DEFAULT_SENDER_VASP_ID)
  const [receiverVaspId, setReceiverVaspId] = useState(DEFAULT_RECEIVER_VASP_ID)
  const [idempotencyKey, setIdempotencyKey] = useState('')
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [decision, setDecision] = useState<DecisionPreview | null>(null)
  const [execution, setExecution] = useState<ExecutionState>({ loading: false })

  const effectiveSelectedPolicyId = selectedPolicyId ?? policies[0]?._id ?? null
  const selectedPolicy =
    policies.find((policy) => policy._id === effectiveSelectedPolicyId) ?? policies[0] ?? null

  const numericAmount = Number(amount || 0)
  const numericSenderCountry = Number(senderCountry)
  const numericReceiverCountry = Number(receiverCountry)
  const trimmedSenderPubkey = senderPubkey.trim()
  const trimmedRecipientPubkey = recipientPubkey.trim()
  const liveQuoteCapable = backendStatus === 'connected' && policiesLive && selectedPolicy

  const selectedPolicySummary = selectedPolicy
    ? [
        `Ceiling ${formatCurrency(selectedPolicy.maxAmount)}`,
        `AML ${selectedPolicy.amlThreshold}`,
        selectedPolicy.travelRuleRequired
          ? `Travel rule from ${formatCurrency(selectedPolicy.travelRuleRequiredAmount)}`
          : 'Travel rule off',
      ].join(' | ')
    : 'No policy selected'

  const resetSession = () => {
    setDecision(null)
    setExecution({ loading: false })
    setQuoteError(null)
  }

  const runQuote = async () => {
    if (!selectedPolicy) {
      setQuoteError('Select a policy before running a quote.')
      return
    }

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setQuoteError('Enter a valid payment amount before running the quote.')
      return
    }

    setQuoteLoading(true)
    setQuoteError(null)
    setDecision(null)
    setExecution({ loading: false })

    const cleanIdempotencyKey = idempotencyKey.trim() || undefined

    try {
      if (mode === 'direct') {
        const attestation = {
          kycVerified,
          amlScore,
          travelRuleFieldsPresent,
        }

        const checks = buildChecks(
          selectedPolicy,
          numericAmount,
          numericSenderCountry,
          numericReceiverCountry,
          attestation,
        )

        if (liveQuoteCapable) {
          const response = await api.quoteDirect({
            policyOnChainAddress: selectedPolicy.onChainPolicyAddress,
            amount: numericAmount,
            senderCountry: numericSenderCountry,
            receiverCountry: numericReceiverCountry,
            kycVerified,
            amlScore,
            senderVaspId,
            receiverVaspId,
            travelRuleFieldsPresent,
            travelRulePayloadVersion: 1,
            senderPubkey: trimmedSenderPubkey || undefined,
            idempotencyKey: cleanIdempotencyKey,
          })

          setDecision({
            source: 'live',
            mode,
            allowed: response.allowed,
            reason: response.reason ?? buildReason(checks),
            decisionId: response.decisionId,
            payloadHash: response.payloadHash,
            checks,
          })
        } else {
          const allowed = checks.every((check) => check.passed)
          setDecision({
            source: 'demo',
            mode,
            allowed,
            reason: buildReason(checks),
            decisionId: `DEMO-${Date.now()}`,
            payloadHash: '0'.repeat(64),
            checks,
          })
        }
      } else {
        if (!trimmedSenderPubkey || !trimmedRecipientPubkey) {
          setQuoteError('Sender and recipient public keys are required in orchestrated mode.')
          return
        }

        if (liveQuoteCapable) {
          const route = await api.previewRoute({
            policyOnChainAddress: selectedPolicy.onChainPolicyAddress,
            amount: numericAmount,
            senderCountry: numericSenderCountry,
            receiverCountry: numericReceiverCountry,
            senderPubkey: trimmedSenderPubkey,
            recipientPubkey: trimmedRecipientPubkey,
            idempotencyKey: cleanIdempotencyKey,
          })

          const response = await api.quoteOrchestrated({
            policyOnChainAddress: selectedPolicy.onChainPolicyAddress,
            amount: numericAmount,
            senderCountry: numericSenderCountry,
            receiverCountry: numericReceiverCountry,
            senderPubkey: trimmedSenderPubkey,
            recipientPubkey: trimmedRecipientPubkey,
            idempotencyKey: cleanIdempotencyKey,
          })

          const attestationPreview =
            response.attestationPreview ??
            buildDemoPartnerSignals(selectedPolicy, numericAmount).attestationPreview
          const checks = buildChecks(
            selectedPolicy,
            numericAmount,
            numericSenderCountry,
            numericReceiverCountry,
            attestationPreview,
          )

          setDecision({
            source: 'live',
            mode,
            allowed: response.allowed,
            reason: response.reason ?? buildReason(checks),
            decisionId: response.decisionId,
            payloadHash: response.payloadHash,
            route: route.route,
            partnerMeta: response.partnerMeta,
            attestationPreview,
            checks,
          })
        } else {
          const route = buildDemoRoute(
            selectedPolicy,
            numericSenderCountry,
            numericReceiverCountry,
          )
          const signals = buildDemoPartnerSignals(selectedPolicy, numericAmount)
          const checks = buildChecks(
            selectedPolicy,
            numericAmount,
            numericSenderCountry,
            numericReceiverCountry,
            signals.attestationPreview,
          )
          const allowed = checks.every((check) => check.passed)

          setDecision({
            source: 'demo',
            mode,
            allowed,
            reason: buildReason(checks),
            decisionId: `DEMO-${Date.now()}`,
            payloadHash: '0'.repeat(64),
            route,
            partnerMeta: signals.partnerMeta,
            attestationPreview: signals.attestationPreview,
            checks,
          })
        }
      }
    } catch (error) {
      setQuoteError(
        error instanceof Error ? error.message : 'Unable to complete the settlement quote.',
      )
    } finally {
      setQuoteLoading(false)
    }
  }

  const executeSettlement = async () => {
    if (!selectedPolicy || !decision?.allowed) return

    if (decision.source === 'live' && !senderSecretKey.trim()) {
      setExecution({
        loading: false,
        error: 'Live execution requires the sender secret key that matches the signing wallet.',
      })
      return
    }

    setExecution({ loading: true, error: null })

    try {
      if (decision.source === 'live') {
        const cleanIdempotencyKey = idempotencyKey.trim() || undefined

        const response =
          mode === 'direct'
            ? await api.executeDirect({
                policyOnChainAddress: selectedPolicy.onChainPolicyAddress,
                amount: numericAmount,
                senderCountry: numericSenderCountry,
                receiverCountry: numericReceiverCountry,
                kycVerified,
                amlScore,
                senderVaspId,
                receiverVaspId,
                travelRuleFieldsPresent,
                travelRulePayloadVersion: 1,
                senderPubkey: trimmedSenderPubkey || undefined,
                senderSecretKey,
                recipientPubkey: trimmedRecipientPubkey,
                idempotencyKey: cleanIdempotencyKey,
              })
            : await api.executeOrchestrated({
                policyOnChainAddress: selectedPolicy.onChainPolicyAddress,
                amount: numericAmount,
                senderCountry: numericSenderCountry,
                receiverCountry: numericReceiverCountry,
                senderPubkey: trimmedSenderPubkey,
                recipientPubkey: trimmedRecipientPubkey,
                senderSecretKey,
                idempotencyKey: cleanIdempotencyKey,
              })

        if (!response.success || !response.txSignature) {
          throw new Error(
            response.error || response.reason || 'Execution did not return a transaction signature.',
          )
        }

        setExecution({
          loading: false,
          source: 'live',
          txSignature: response.txSignature,
          auditId: response.auditId,
        })
        return
      }

      await new Promise((resolve) => window.setTimeout(resolve, 1400))
      setExecution({
        loading: false,
        source: 'demo',
        txSignature: `SIM-${Date.now().toString(16)}`,
        auditId: `AUD-DEMO-${new Date().getSeconds()}`,
      })
    } catch (error) {
      setExecution({
        loading: false,
        error:
          error instanceof Error ? error.message : 'Unable to execute the settlement.',
      })
    }
  }

  return (
    <div className="page-shell payments-page">
      <section className="metric-band">
        <article className="metric-band-item">
          <span className="metric-band-label">Execution mode</span>
          <strong>{mode === 'direct' ? 'Direct attestation' : 'Orchestrated partner flow'}</strong>
          <p>{selectedPolicySummary}</p>
        </article>
        <article className="metric-band-item">
          <span className="metric-band-label">Backend posture</span>
          <strong>{backendStatus === 'connected' ? 'Live backend' : 'Demo simulation'}</strong>
          <p>{policiesLive ? 'Policy feed is connected' : 'Fallback data is active'}</p>
        </article>
        <article className="metric-band-item">
          <span className="metric-band-label">Selected corridor</span>
          <strong>
            {getCountryLabel(numericSenderCountry)}
            {' -> '}
            {getCountryLabel(numericReceiverCountry)}
          </strong>
          <p>{selectedPolicy ? selectedPolicy.institutionId : 'Choose a policy'}</p>
        </article>
        <article className="metric-band-item">
          <span className="metric-band-label">Quote amount</span>
          <strong>{formatCurrency(numericAmount || 0)}</strong>
          <p>{policyError ?? 'Ready for validation and settlement execution'}</p>
        </article>
      </section>

      {(quoteError || execution.error) && (
        <div className="notice-banner">
          <span className="notice-banner-title">Settlement note</span>
          <span>{quoteError ?? execution.error}</span>
        </div>
      )}

      <div className="payments-layout">
        <section className="surface-panel form-panel">
          <div className="segmented-control">
            <button
              type="button"
              className={`segmented-control-item${
                mode === 'direct' ? ' segmented-control-item-active' : ''
              }`}
              onClick={() => {
                setMode('direct')
                resetSession()
              }}
            >
              Direct
            </button>
            <button
              type="button"
              className={`segmented-control-item${
                mode === 'orchestrated' ? ' segmented-control-item-active' : ''
              }`}
              onClick={() => {
                setMode('orchestrated')
                resetSession()
              }}
            >
              Orchestrated
            </button>
          </div>

          <div className="section-heading">
            <div>
              <span className="eyebrow">Validation inputs</span>
              <h3>Prepare the settlement request</h3>
            </div>
          </div>

          <div className="form-grid">
            <label className="field">
              <span className="label">Policy</span>
              <select
                className="input"
                value={effectiveSelectedPolicyId ?? ''}
                onChange={(event) => {
                  setSelectedPolicyId(event.target.value)
                  resetSession()
                }}
                >
                  {policies.map((policy) => (
                    <option key={policy._id} value={policy._id}>
                      POL-{String(policy.policyId).padStart(3, '0')} - {policy.institutionId}
                    </option>
                  ))}
                </select>
            </label>
            <label className="field">
              <span className="label">Amount (USDC)</span>
              <input
                type="number"
                className="input"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </label>
            <label className="field">
              <span className="label">Sender public key</span>
              <input
                className="input"
                value={senderPubkey}
                onChange={(event) => setSenderPubkey(event.target.value)}
              />
            </label>
            <label className="field">
              <span className="label">Recipient public key</span>
              <input
                className="input"
                value={recipientPubkey}
                onChange={(event) => setRecipientPubkey(event.target.value)}
              />
            </label>
            <label className="field">
              <span className="label">Sender country</span>
              <select
                className="input"
                value={senderCountry}
                onChange={(event) => setSenderCountry(event.target.value)}
                >
                  {COUNTRY_OPTIONS.map((country) => (
                    <option key={country.code} value={country.code}>
                      {country.iso2} - {country.label}
                    </option>
                  ))}
                </select>
            </label>
            <label className="field">
              <span className="label">Receiver country</span>
              <select
                className="input"
                value={receiverCountry}
                onChange={(event) => setReceiverCountry(event.target.value)}
                >
                  {COUNTRY_OPTIONS.map((country) => (
                    <option key={country.code} value={country.code}>
                      {country.iso2} - {country.label}
                    </option>
                  ))}
                </select>
            </label>
          </div>

          {mode === 'direct' && (
            <>
              <div className="switch-grid">
                <label className="switch-row">
                  <div>
                    <span className="label">KYC verified</span>
                    <p>Direct mode supplies the attestation fields manually.</p>
                  </div>
                  <button
                    type="button"
                    className={`switch${kycVerified ? ' switch-active' : ''}`}
                    onClick={() => setKycVerified((value) => !value)}
                    aria-pressed={kycVerified}
                  >
                    <span />
                  </button>
                </label>
                <label className="switch-row">
                  <div>
                    <span className="label">Travel rule fields present</span>
                    <p>Required when the threshold is crossed and the policy demands it.</p>
                  </div>
                  <button
                    type="button"
                    className={`switch${travelRuleFieldsPresent ? ' switch-active' : ''}`}
                    onClick={() => setTravelRuleFieldsPresent((value) => !value)}
                    aria-pressed={travelRuleFieldsPresent}
                  >
                    <span />
                  </button>
                </label>
              </div>

              <label className="field">
                <span className="label">AML score</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={amlScore}
                  onChange={(event) => setAmlScore(Number(event.target.value))}
                  className="risk-slider"
                />
                <span className="field-note">Current score: {amlScore}</span>
              </label>
            </>
          )}

          <details className="advanced-panel">
            <summary>Advanced settlement inputs</summary>
            <div className="advanced-grid">
              <label className="field">
                <span className="label">Sender VASP ID</span>
                <input
                  className="input mono"
                  value={senderVaspId}
                  onChange={(event) => setSenderVaspId(event.target.value)}
                />
              </label>
              <label className="field">
                <span className="label">Receiver VASP ID</span>
                <input
                  className="input mono"
                  value={receiverVaspId}
                  onChange={(event) => setReceiverVaspId(event.target.value)}
                />
              </label>
              <label className="field field-full">
                <span className="label">Idempotency key</span>
                <input
                  className="input"
                  value={idempotencyKey}
                  onChange={(event) => setIdempotencyKey(event.target.value)}
                  placeholder="Optional replay guard"
                />
              </label>
            </div>
          </details>

          <label className="field">
            <span className="label">
              Sender secret key {backendStatus === 'connected' ? '(required for live execute)' : '(optional in demo)'}
            </span>
            <input
              type="password"
              className="input"
              value={senderSecretKey}
              onChange={(event) => setSenderSecretKey(event.target.value)}
              placeholder="Hackathon demo signer"
            />
          </label>

          <div className="panel-actions">
            <button
              type="button"
              className="button button-primary"
              onClick={runQuote}
              disabled={quoteLoading || !selectedPolicy}
            >
              {quoteLoading
                ? 'Running settlement quote...'
                : mode === 'direct'
                  ? 'Validate payment'
                  : 'Preview route and validate'}
            </button>
          </div>
        </section>

        <section className="surface-panel decision-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Decision output</span>
              <h3>Review the policy verdict</h3>
            </div>
            {decision && (
              <span
                className={`decision-pill ${
                  decision.allowed ? 'decision-pill-allowed' : 'decision-pill-blocked'
                }`}
              >
                {decision.allowed ? 'Allowed' : 'Blocked'}
              </span>
            )}
          </div>

          {!decision ? (
            <div className="empty-panel">
              <h4>No quote has been run</h4>
              <p>
                Use the form to validate the corridor. Direct mode uses manual
                attestation inputs, while orchestrated mode asks the partner
                layer for route and risk signals first.
              </p>
            </div>
          ) : (
            <div className="decision-stack">
              <div className="decision-hero">
                <div>
                  <span className="data-label">Decision ID</span>
                  <strong>{decision.decisionId}</strong>
                </div>
                <div className="decision-hero-meta">
                  <span className="data-badge data-badge-neutral">
                    {decision.source === 'live' ? 'Live response' : 'Demo simulation'}
                  </span>
                  <span className="data-badge data-badge-neutral">
                    {decision.mode === 'direct' ? 'Direct path' : 'Partner path'}
                  </span>
                </div>
              </div>

              <div className="decision-reason">
                <span className="data-label">Reason</span>
                <p>{decision.reason}</p>
              </div>

              <div className="check-stack">
                {decision.checks.map((check) => (
                  <article key={check.label} className="check-row">
                    <span
                      className={`check-indicator${
                        check.passed ? ' check-indicator-pass' : ' check-indicator-fail'
                      }`}
                    />
                    <div>
                      <p className="check-title">{check.label}</p>
                      <p className="check-detail">{check.detail}</p>
                    </div>
                  </article>
                ))}
              </div>

              {(decision.route || decision.partnerMeta || decision.payloadHash) && (
                <div className="meta-grid">
                  {decision.route && (
                    <article className="meta-card">
                      <span className="data-label">Route preview</span>
                      <strong>{decision.route.routeDescription ?? 'Partner route prepared'}</strong>
                      <p>{decision.route.routeId ?? 'No route identifier returned'}</p>
                    </article>
                  )}
                  {decision.partnerMeta?.fxRiskLabel && (
                    <article className="meta-card">
                      <span className="data-label">FX risk</span>
                      <strong>{String(decision.partnerMeta.fxRiskLabel)}</strong>
                      <p>Returned by the partner enrichment layer.</p>
                    </article>
                  )}
                  {decision.payloadHash && (
                    <article className="meta-card">
                      <span className="data-label">Payload hash</span>
                      <strong className="mono">{shortenAddress(decision.payloadHash, 12, 12)}</strong>
                      <p>Integrity anchor used by the settlement path.</p>
                    </article>
                  )}
                </div>
              )}

              {decision.allowed && (
                <div className="execute-panel">
                  <div>
                    <span className="eyebrow">Execute</span>
                    <h4>Submit the settlement transaction</h4>
                    <p>
                      Live execution signs through the backend route. Demo mode
                      generates a simulated signature so the full flow can still
                      be shown end to end.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={executeSettlement}
                    disabled={execution.loading}
                  >
                    {execution.loading ? 'Submitting settlement...' : 'Execute settlement'}
                  </button>
                </div>
              )}

              {execution.txSignature && (
                <div className="success-shell">
                  <span className="data-badge data-badge-confirmed">
                    {execution.source === 'live' ? 'Transaction confirmed' : 'Demo execution ready'}
                  </span>
                  <div className="success-shell-grid">
                    <div>
                      <span className="data-label">Transaction signature</span>
                      <strong className="mono">{execution.txSignature}</strong>
                    </div>
                    <div>
                      <span className="data-label">Audit ID</span>
                      <strong>{execution.auditId ?? 'Awaiting audit log'}</strong>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      <section className="surface-panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Recent settlements</span>
            <h3>Latest activity available to the terminal</h3>
          </div>
        </div>

        <div className="data-stack">
          {audits.map((audit) => (
            <article key={audit.auditId} className="data-row">
              <div className="data-row-main">
                <div>
                  <p className="data-row-title">{audit.auditId}</p>
                  <p className="data-row-subtitle">{formatDateTime(audit.createdAt)}</p>
                </div>
                <div className="data-row-copy">
                  <span>{formatCurrency(Number(audit.inputSnapshot.amount ?? 0))}</span>
                  <span>{formatRelativeTime(audit.createdAt)}</span>
                </div>
              </div>
              <div className="data-row-meta">
                <StatusPill status={audit.status} />
                <span className="mono subtle-text">
                  {audit.onChainTxSig ? shortenAddress(audit.onChainTxSig, 8, 6) : 'Awaiting tx'}
                </span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
