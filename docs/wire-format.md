# PolicyPay X Wire Format (MVP)

This document defines the exact fields that flow between the **backend** and the **Solana program** for a settlement attempt. The goal is to ensure the smart contract enforces policy strictly using **crypto-verifiable attestations** (no fabricated KYC/AML/Travel Rule data).

## 1) Compliance attestations (what the contract trusts)

### Attestation fields (provided by the client/backend, verified by signatures)
- `kyc_verified`: `bool`
- `aml_score`: `u8` (0-255)
- `travelRule`: `TravelRulePayload` (see below)
- `payload_hash`: `bytes32`

### Compliance issuer authenticity

The program requires `complianceIssuer` to be the expected signer for settlement. Concretely:
- The `settle_payment` instruction requires the `compliance_issuer` account to be a signer.
- The program stores a single `compliance_issuer_pubkey` in `ProgramConfig`.
- The `settle_payment` instruction rejects unless the signing account matches `ProgramConfig.compliance_issuer_pubkey`.

For MVP simplicity, the *authenticity* guarantee is: the issuer signs the transaction (and the included `payload_hash` binds the attestation payload to that signing event).

## 2) Travel Rule payload

Travel Rule must be **signed/verifiable** in a way that the contract can verify its integrity.

### TravelRulePayload (MVP set)
- `sender_vasp_id`: `bytes32` (hash of VASP identifier)
- `receiver_vasp_id`: `bytes32` (hash of VASP identifier)
- `travel_rule_required_fields_present`: `bool` (whether required fields were present in the attested payload)
- `travel_rule_payload_version`: `u8`

MVP note: For hackathon scope, we do not implement the full Travel Rule message standard. Instead, we enforce that:
1) the payload hash matches what the issuer attested, and
2) the contract can enforce “presence/attested-ness” via `travel_rule_required_fields_present`.

## 3) AML semantics

Define AML policy evaluation strictly in the on-chain program.

### Policy parameter
- `aml_threshold`: `u8`

### Enforcement rule (MVP)
- `allowed` if `aml_score <= aml_threshold`
- `blocked` if `aml_score > aml_threshold`

This keeps it deterministic and easy to demo: you can build two payments with `aml_score` values on either side of the threshold.

## 4) Blocked countries semantics

Policy parameter:
- `blocked_countries`: fixed-size array of ISO country codes encoded into `u8` values (MVP encoding scheme defined below)

Enforcement rule:
- If `sender_country` is in `blocked_countries`, reject.
- If `receiver_country` is in `blocked_countries`, reject.
- Otherwise allow (subject to other checks).

### Country encoding (MVP)
- For simplicity, backend maps ISO-3166-1 alpha-2 codes to a small numeric representation `u8`.
- The mapping must be consistent between backend and contract.

MVP encoding approach:
- Use a predetermined list of country codes relevant to the demo, stored in code (not dynamically).
- If backend submits a code not in that list, it is treated as “not blocked” (and the contract must not panic).

## 5) Payment settlement inputs

The `settle_payment` instruction input parameters must include:
- `policy`: `Pubkey`
- `amount`: `u64`
- `sender_country`: `u8`
- `receiver_country`: `u8`
- `kyc_verified`: `bool`
- `aml_score`: `u8`
- `travelRule`: `TravelRulePayload`
- `travel_rule_payload_hash`: `bytes32` (alias: `payload_hash`)
- `idempotency_key`: `bytes32` (optional but recommended for audit dedupe)

The contract uses `policy`, `amount`, `sender_country`, `receiver_country`, `kyc_verified`, and `aml_score` to enforce checks, and uses `travelRule` + `payload_hash` to enforce Travel Rule presence integrity.

## 6) payload_hash scheme (hash binding)

The backend and on-chain program MUST compute the same hash for the attestation payload.

MVP scheme:
- Compute `payload_hash = sha256( BCS( AttestationPayload ) )`

Where `AttestationPayload` is the concatenation/serialization of:
- `kyc_verified` (`bool`)
- `aml_score` (`u8`)
- `travelRule.sender_vasp_id` (`bytes32`)
- `travelRule.receiver_vasp_id` (`bytes32`)
- `travelRule.travel_rule_required_fields_present` (`bool`)
- `travelRule.travel_rule_payload_version` (`u8`)

The backend includes `payload_hash` in the instruction data, and the program recomputes the hash from the provided fields and rejects if it does not match.

This ensures the contract cannot be tricked into accepting a payload with mismatched data.

## 7) Suggested event output (for audit indexing)

Emit an event `ComplianceDecision` containing:
- `policy` (pubkey)
- `amount` (u64)
- `allowed` (bool)
- `kyc_verified` (bool)
- `aml_score` (u8)
- `sender_country` (u8)
- `receiver_country` (u8)
- `travelRule.sender_vasp_id` (bytes32)
- `travelRule.receiver_vasp_id` (bytes32)
- `payload_hash` (bytes32)

Backend can index events to produce `audit_logs`.

