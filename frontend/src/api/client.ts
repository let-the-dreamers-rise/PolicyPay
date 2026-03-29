const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '')
const API_KEY = (import.meta.env.VITE_API_KEY ?? '').trim()
const HEALTH_URL = API_BASE.endsWith('/api')
  ? `${API_BASE.slice(0, -4)}/health`
  : `${API_BASE}/health`

export interface PolicyDoc {
  _id: string
  policyId: number
  institutionId: string
  onChainPolicyAddress: string
  maxAmount: number
  requireKyc: boolean
  amlThreshold: number
  blockedCountries: number[]
  travelRuleRequired: boolean
  travelRuleRequiredAmount: number
  createdAt: string
}

export interface AuditLogDoc {
  _id: string
  auditId: string
  decisionId: string
  onChainTxSig: string
  status: 'pending' | 'submitted' | 'confirmed' | 'failed'
  inputSnapshot: Record<string, unknown>
  eventData: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface DecisionDoc {
  _id: string
  decisionId: string
  policyId: number
  institutionId: string
  amount: number
  senderCountry: number
  receiverCountry: number
  kycVerified: boolean
  amlScore: number
  fxRiskLabel?: string | null
  travelRuleFieldsPresent: boolean
  payloadHash: string
  allowed: boolean
  reason: string | null
  createdAt: string
}

export interface CreatePolicyRequest {
  institutionId: string
  institutionSecretKey: string
  policyId: number
  maxAmount: number
  requireKyc: boolean
  amlThreshold: number
  blockedCountries: number[]
  travelRuleRequired: boolean
  travelRuleRequiredAmount: number
}

export interface CreatePolicyResponse {
  success: boolean
  txSignature: string
  policyAddress: string
  policy: PolicyDoc
}

export interface DirectQuoteRequest {
  policyOnChainAddress: string
  amount: number
  senderCountry: number
  receiverCountry: number
  kycVerified: boolean
  amlScore: number
  senderVaspId: string
  receiverVaspId: string
  travelRuleFieldsPresent: boolean
  travelRulePayloadVersion: number
  senderPubkey?: string
  idempotencyKey?: string
}

export interface DirectExecuteRequest extends DirectQuoteRequest {
  senderSecretKey: string
  recipientPubkey: string
}

export interface OrchestratedQuoteRequest {
  policyOnChainAddress: string
  amount: number
  senderCountry: number
  receiverCountry: number
  senderPubkey: string
  recipientPubkey: string
  idempotencyKey?: string
}

export interface OrchestratedExecuteRequest extends OrchestratedQuoteRequest {
  senderSecretKey: string
}

export interface AttestationPreview {
  kycVerified: boolean
  amlScore: number
  senderVaspId: string
  receiverVaspId: string
  travelRuleFieldsPresent: boolean
  travelRulePayloadVersion: number
}

export interface PartnerMeta {
  routeId?: string | null
  routeDescription?: string | null
  fxRiskLabel?: string | null
  [key: string]: unknown
}

export interface PaymentDecisionResponse {
  success: boolean
  cached?: boolean
  decisionId: string
  allowed: boolean
  reason: string | null
  payloadHash?: string | null
  partnerMeta?: PartnerMeta | null
  attestationPreview?: AttestationPreview
}

export interface ExecutePaymentResponse {
  success: boolean
  cached?: boolean
  decisionId?: string
  auditId?: string
  txSignature?: string
  allowed?: boolean
  reason?: string | null
  partnerMeta?: PartnerMeta | null
  error?: string
}

export interface RoutePreviewResponse {
  success: boolean
  auditId: string
  demoScenario: string
  route: {
    routeId?: string | null
    routeDescription?: string | null
    senderVaspId?: string | null
    receiverVaspId?: string | null
  }
  nextSteps: Record<string, string>
}

export interface AuditListResponse {
  success: boolean
  audits: AuditLogDoc[]
  pagination: { page: number; limit: number; total: number; pages: number }
}

export interface AuditDetailResponse {
  success: boolean
  audit: AuditLogDoc
  decision: DecisionDoc | null
}

class ApiClient {
  private get headers(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (API_KEY) {
      headers['x-api-key'] = API_KEY
    }

    return headers
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        ...this.headers,
        ...(options?.headers ?? {}),
      },
    })

    if (!response.ok) {
      const payload = await response
        .json()
        .catch(() => ({ error: response.statusText || 'Request failed' }))

      throw new Error(payload.error || payload.message || `API error ${response.status}`)
    }

    return response.json() as Promise<T>
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(HEALTH_URL, {
        signal: AbortSignal.timeout(3000),
      })
      return response.ok
    } catch {
      return false
    }
  }

  async getPolicies(): Promise<{ success: boolean; policies: PolicyDoc[] }> {
    return this.request('/policies')
  }

  async createPolicy(payload: CreatePolicyRequest): Promise<CreatePolicyResponse> {
    return this.request('/policies', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  async quoteDirect(payload: DirectQuoteRequest): Promise<PaymentDecisionResponse> {
    return this.request('/payments/quote', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  async executeDirect(payload: DirectExecuteRequest): Promise<ExecutePaymentResponse> {
    return this.request('/payments/execute', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  async quoteOrchestrated(
    payload: OrchestratedQuoteRequest,
  ): Promise<PaymentDecisionResponse> {
    return this.request('/payments/quote/orchestrated', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  async executeOrchestrated(
    payload: OrchestratedExecuteRequest,
  ): Promise<ExecutePaymentResponse> {
    return this.request('/payments/execute/orchestrated', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  async previewRoute(payload: OrchestratedQuoteRequest): Promise<RoutePreviewResponse> {
    return this.request('/demo/route-and-quote', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  async getAuditLogs(page = 1, limit = 12): Promise<AuditListResponse> {
    return this.request(`/audit?page=${page}&limit=${limit}`)
  }

  async getAuditLog(id: string): Promise<AuditDetailResponse> {
    return this.request(`/audit/${id}`)
  }

  async enrichAudit(id: string): Promise<{ success: boolean; eventData: unknown }> {
    return this.request(`/audit/${id}/enrich`, {
      method: 'POST',
    })
  }
}

export const api = new ApiClient()

export const DEMO_POLICIES: PolicyDoc[] = [
  {
    _id: 'demo-policy-1',
    policyId: 1,
    institutionId: 'AMINA Bank Zurich',
    onChainPolicyAddress: 'F8wbgEAjVgGBTTMXPKWRDzfw8sQJdd2KRe7EVWFDeGRL',
    maxAmount: 500000,
    requireKyc: true,
    amlThreshold: 50,
    blockedCountries: [7, 8, 9],
    travelRuleRequired: true,
    travelRuleRequiredAmount: 1000,
    createdAt: '2026-03-20T10:00:00Z',
  },
  {
    _id: 'demo-policy-2',
    policyId: 2,
    institutionId: 'Solstice Labs',
    onChainPolicyAddress: 'J2S5VC6rhY5G22mQhukKN6uo4EmN7Yi9ku37exs8jCZX',
    maxAmount: 1000000,
    requireKyc: true,
    amlThreshold: 40,
    blockedCountries: [7, 8],
    travelRuleRequired: true,
    travelRuleRequiredAmount: 3000,
    createdAt: '2026-03-20T12:00:00Z',
  },
  {
    _id: 'demo-policy-3',
    policyId: 3,
    institutionId: 'Keyrock BV',
    onChainPolicyAddress: 'GfU44yGJCzXD4FsCtrzijt4Ymo6zsCcdHzJiVtPTcs3z',
    maxAmount: 250000,
    requireKyc: true,
    amlThreshold: 45,
    blockedCountries: [7, 8, 9, 10],
    travelRuleRequired: true,
    travelRuleRequiredAmount: 500,
    createdAt: '2026-03-21T09:00:00Z',
  },
  {
    _id: 'demo-policy-4',
    policyId: 4,
    institutionId: 'Copper Markets',
    onChainPolicyAddress: '6gYY3Z9r2h3R9yyos7wwpTkVvG7eoTKnBwXierxH4vVf',
    maxAmount: 750000,
    requireKyc: true,
    amlThreshold: 55,
    blockedCountries: [7, 8],
    travelRuleRequired: false,
    travelRuleRequiredAmount: 5000,
    createdAt: '2026-03-22T14:30:00Z',
  },
]

export const DEMO_AUDIT_LOGS: AuditLogDoc[] = [
  {
    _id: 'demo-audit-1',
    auditId: 'AUD-0234',
    decisionId: 'DEC-0891',
    onChainTxSig: '4Kx7Y8f2Nm2Ws',
    status: 'confirmed',
    inputSnapshot: {
      amount: 125000,
      kycVerified: true,
      amlScore: 28,
      travelRuleFieldsPresent: true,
      senderCountry: 1,
      receiverCountry: 2,
    },
    eventData: null,
    createdAt: '2026-03-24T12:45:02Z',
    updatedAt: '2026-03-24T12:45:02Z',
  },
  {
    _id: 'demo-audit-2',
    auditId: 'AUD-0233',
    decisionId: 'DEC-0890',
    onChainTxSig: '8Rp3M6r1Tj6Bv',
    status: 'confirmed',
    inputSnapshot: {
      amount: 50000,
      kycVerified: true,
      amlScore: 15,
      travelRuleFieldsPresent: true,
      senderCountry: 1,
      receiverCountry: 5,
    },
    eventData: null,
    createdAt: '2026-03-24T12:38:15Z',
    updatedAt: '2026-03-24T12:38:15Z',
  },
  {
    _id: 'demo-audit-3',
    auditId: 'AUD-0232',
    decisionId: 'DEC-0889',
    onChainTxSig: '',
    status: 'failed',
    inputSnapshot: {
      amount: 250000,
      kycVerified: false,
      amlScore: 72,
      travelRuleFieldsPresent: false,
      senderCountry: 7,
      receiverCountry: 2,
    },
    eventData: null,
    createdAt: '2026-03-24T12:30:44Z',
    updatedAt: '2026-03-24T12:30:44Z',
  },
  {
    _id: 'demo-audit-4',
    auditId: 'AUD-0231',
    decisionId: 'DEC-0888',
    onChainTxSig: '2Wn5K9q4Hq8Ld',
    status: 'confirmed',
    inputSnapshot: {
      amount: 75000,
      kycVerified: true,
      amlScore: 33,
      travelRuleFieldsPresent: true,
      senderCountry: 3,
      receiverCountry: 2,
    },
    eventData: null,
    createdAt: '2026-03-24T12:22:11Z',
    updatedAt: '2026-03-24T12:22:11Z',
  },
  {
    _id: 'demo-audit-5',
    auditId: 'AUD-0230',
    decisionId: 'DEC-0887',
    onChainTxSig: '9Ym4RPx7Jf',
    status: 'pending',
    inputSnapshot: {
      amount: 180000,
      kycVerified: true,
      amlScore: 41,
      travelRuleFieldsPresent: true,
      senderCountry: 1,
      receiverCountry: 3,
    },
    eventData: null,
    createdAt: '2026-03-24T12:15:30Z',
    updatedAt: '2026-03-24T12:15:30Z',
  },
  {
    _id: 'demo-audit-6',
    auditId: 'AUD-0229',
    decisionId: 'DEC-0886',
    onChainTxSig: '5Tn8SDw3Kv',
    status: 'confirmed',
    inputSnapshot: {
      amount: 320000,
      kycVerified: true,
      amlScore: 22,
      travelRuleFieldsPresent: true,
      senderCountry: 1,
      receiverCountry: 4,
    },
    eventData: null,
    createdAt: '2026-03-24T11:58:22Z',
    updatedAt: '2026-03-24T11:58:22Z',
  },
  {
    _id: 'demo-audit-7',
    auditId: 'AUD-0228',
    decisionId: 'DEC-0885',
    onChainTxSig: '',
    status: 'failed',
    inputSnapshot: {
      amount: 95000,
      kycVerified: true,
      amlScore: 67,
      travelRuleFieldsPresent: true,
      senderCountry: 5,
      receiverCountry: 2,
    },
    eventData: null,
    createdAt: '2026-03-24T11:45:07Z',
    updatedAt: '2026-03-24T11:45:07Z',
  },
  {
    _id: 'demo-audit-8',
    auditId: 'AUD-0227',
    decisionId: 'DEC-0884',
    onChainTxSig: '7Fk2NRq9Mb',
    status: 'confirmed',
    inputSnapshot: {
      amount: 42000,
      kycVerified: true,
      amlScore: 19,
      travelRuleFieldsPresent: true,
      senderCountry: 2,
      receiverCountry: 1,
    },
    eventData: null,
    createdAt: '2026-03-24T11:32:55Z',
    updatedAt: '2026-03-24T11:32:55Z',
  },
]

export function buildDemoAuditDetail(auditId: string): AuditDetailResponse | null {
  const audit = DEMO_AUDIT_LOGS.find((entry) => entry.auditId === auditId)
  if (!audit) return null

  const policy = DEMO_POLICIES[(audit.auditId.charCodeAt(audit.auditId.length - 1) ?? 0) % DEMO_POLICIES.length]
  const snapshot = audit.inputSnapshot
  const amount = Number(snapshot.amount ?? 0)
  const senderCountry = Number(snapshot.senderCountry ?? 1)
  const receiverCountry = Number(snapshot.receiverCountry ?? 2)
  const kycVerified = Boolean(snapshot.kycVerified)
  const amlScore = Number(snapshot.amlScore ?? 0)
  const travelRuleFieldsPresent = Boolean(snapshot.travelRuleFieldsPresent)

  return {
    success: true,
    audit,
    decision: {
      _id: `demo-decision-${audit.decisionId}`,
      decisionId: audit.decisionId,
      policyId: policy.policyId,
      institutionId: policy.institutionId,
      amount,
      senderCountry,
      receiverCountry,
      kycVerified,
      amlScore,
      travelRuleFieldsPresent,
      payloadHash: '0'.repeat(64),
      allowed: audit.status !== 'failed',
      reason: audit.status === 'failed' ? 'Policy rejected this payment during validation' : null,
      createdAt: audit.createdAt,
    },
  }
}
