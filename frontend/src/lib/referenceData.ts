export interface CountryOption {
  code: number
  iso2: string
  label: string
}

// The protocol stores country identifiers as u8 values on-chain.
// Keep the frontend registry aligned with that compact range.
export const COUNTRY_OPTIONS: CountryOption[] = [
  { code: 1, iso2: 'CH', label: 'Switzerland' },
  { code: 2, iso2: 'DE', label: 'Germany' },
  { code: 3, iso2: 'US', label: 'United States' },
  { code: 4, iso2: 'GB', label: 'United Kingdom' },
  { code: 5, iso2: 'SG', label: 'Singapore' },
  { code: 6, iso2: 'JP', label: 'Japan' },
  { code: 7, iso2: 'IR', label: 'Iran' },
  { code: 8, iso2: 'KP', label: 'North Korea' },
  { code: 9, iso2: 'SY', label: 'Syria' },
  { code: 10, iso2: 'SD', label: 'Sudan' },
]

export const COUNTRY_BY_CODE = new Map(
  COUNTRY_OPTIONS.map((country) => [country.code, country]),
)

export const PARTNER_RAILS = [
  {
    name: 'AMINA-aligned compliance',
    role: 'KYC attestation',
    detail: 'Institution identity checks and policy ownership signals.',
  },
  {
    name: 'Solstice-aligned data',
    role: 'FX and risk inputs',
    detail: 'Market context and risk enrichment for higher-value flows.',
  },
  {
    name: 'Keyrock-simulated routing',
    role: 'Liquidity pathing',
    detail: 'Previewed routes for institutional corridors and best execution.',
  },
  {
    name: 'Solana settlement',
    role: 'Execution layer',
    detail: 'Final policy enforcement and immutable transfer records.',
  },
]

export function getCountryLabel(code: number | null | undefined): string {
  if (code === undefined || code === null) return 'Unknown'
  const match = COUNTRY_BY_CODE.get(code)
  return match ? `${match.iso2} - ${match.label}` : String(code)
}

export function normalizeBlockedCountries(codes: number[]): number[] {
  return codes.filter((code) => code !== 0)
}
