# PolicyPay X - Brainstorm & MVP Plan

## 1) What we’re building

**PolicyPay X** is a programmable compliance and settlement layer for **institutional stablecoin payments on Solana**.

The core concept: **institutions define compliance policies**, the **backend evaluates** those policies using KYC/AML/KYT + risk signals, and the **Solana smart contract enforces the decision at settlement time** (so “compliance is enforced, not optional”).

This turns payments into a *policy-driven* execution flow with clear auditability.

## 2) DoraHacks track alignment

From the project description and desired capabilities, we target:

- **Track:** `Programmable Stablecoin Payments`

We explicitly cover the required regulated-institution context:

- `KYC` (mock/placeholder for MVP, but modeled end-to-end)
- `KYT` (transaction monitoring / risk signals; MVP can be simulated)
- `AML` (risk score thresholding; MVP can be simulated)
- `Travel Rule` (model required sender/receiver info + enforce “present” or “attested” at settlement)

## 3) MVP goals (keep it hackathon-real)

### On-chain MVP goal

1. Store policy parameters on-chain (or store a policy “commitment” + parameters for MVP).
2. Enforce policy checks inside a `settle_payment` instruction.
3. Emit an event (and/or write minimal metadata) so the system has auditability.

### Off-chain MVP goal

1. Provide an API to create policies and simulate KYC/AML/KYT.
2. Compute a decision using a risk engine.
3. Build a Solana transaction that calls the smart contract with:
  - payment details (amount, parties)
  - attestation/decision fields (kyc ok, aml score, travel rule present)
4. Save an audit record in MongoDB.

## 4) Trust boundaries & security model (what we rely on)

We should decide early how to prevent “backend lies about compliance” in a way that is realistic for a hackathon.

###  Signature over attestation payload

- Backend signs a structured attestation payload.
- Program verifies the signature over the payload.
- Benefit: attestation is strongly bound to the specific payment parameters.
- Complexity: higher. Might be too slow for MVP unless we reuse known Solana patterns.

## 5) Proposed on-chain program design (Anchor)

### Accounts / state

- `ProgramConfig`
  - holds authority pubkeys (policy admin, oracle signer)
  - holds configurable settings (e.g., supported stablecoin mint)
- `Policy` account (per institution / per policy)
  - `max_amount` (u64)
  - `require_kyc` (bool)
  - `aml_threshold` (u8)
  - `blocked_countries` (fixed-size list for MVP)
  - `travel_rule_required` (bool) and/or `travel_rule_required_amount` (u64)
  - metadata (policy_id, owner pubkey)

### Instructions

1. `initialize_config`
  - sets `policy_admin` and `compliance_oracle` pubkeys
2. `create_policy`
  - policy owner creates a policy with rules
3. `settle_payment` (the critical enforcement instruction)
  - inputs (in instruction data):
    - `policy` address
    - `amount`
    - `sender_country`, `receiver_country`
    - `kyc_verified` (bool)
    - `aml_score` (u8)
    - `travel_rule_present` (bool or required hash non-zero)
    - `nonce` or `idempotency_key` (optional but recommended)
    - `institution_ids` / VASP references (could be hashes for MVP)
  - required accounts:
    - `compliance_oracle` signer
    - `sender` token account (USDC)
    - `recipient` token account (USDC)
    - SPL Token program
  - checks performed:
    - oracle signer is correct
    - amount <= policy.max_amount (or enforce additional constraints)
    - if policy.require_kyc then kyc_verified == true
    - if aml_score violates policy threshold then block
    - sender/receiver country not in blocked list
    - if travel rule required and amount >= threshold then travel_rule_present == true
  - if all checks pass:
    - execute token transfer (USDC transfer)
    - emit an event containing:
      - policy_id
      - amount
      - decision fields
      - settlement signature / tx id (emitted event is indexable)

## 6) Proposed off-chain backend responsibilities (Express + TS)

### Core services

- Policy service
  - create/update policies (mirrors on-chain or stores a “pending policy” until it’s deployed)
- Compliance decision service (MVP risk engine)
  - compute `kyc_verified` (mock true/false)
  - compute `aml_score` (mock deterministic scoring)
  - compute travel rule presence requirement
  - produce the final “decision object” fed into `settle_payment`
- Solana settlement service
  - connects to devnet
  - prepares transaction calling `settle_payment`
  - collects required accounts (sender/recipient token accounts)
  - signs and submits (backend can sign as oracle signer; the institution signer model depends on how we demonstrate)
- Audit logging service
  - stores:
    - input payload
    - decision result
    - solana tx signature
    - event fields copied from the decision

### API endpoints (MVP)

- `POST /policies`
  - create policy (payload includes thresholds + blocked countries)
- `POST /payments/quote`
  - run decision engine and return compliance decision + predicted “allowed/blocked”
- `POST /payments/execute`
  - if decision is allowed:
    - build and submit Solana tx calling `settle_payment`
    - return tx signature + audit record id
- `GET /audit/:id`
  - retrieve stored audit record

## 7) MongoDB Atlas schema (MVP)

Collections (initially):

- `institutions`
  - institutionId, onChainOwnerPubkey, displayName
- `policies`
  - policyId, institutionId, onChainPolicyAddress (if created on-chain)
  - max_amount, require_kyc, aml_threshold, blocked_countries, travel_rule settings
  - createdAt
- `decisions`
  - decisionId, policyId, aml_score, kyc_verified, travel_rule_present, allowed (bool)
  - createdAt
- `audit_logs`
  - auditId, decisionId, onChainTxSig, status (submitted/confirmed/failed)
  - full input snapshot for reproducibility
  - createdAt

## 8) Tech stack we’ll use

### Solana / smart contracts

- Anchor (TypeScript-based Solana program workflow)
- SPL Token (for USDC transfers)

### Backend

- Express
- Node.js
- TypeScript
- Mongoose (MongoDB Atlas)
- zod (request validation)
- dotenv (env vars)

### Dev/ops helpers 

- Jest or Vitest for backend tests
- Supertest for endpoint tests
- @solana/web3.js + Anchor client for tx building

## 9) Folder / repo structure (suggested)

Since we’re starting from scratch, we can structure the workspace like:

- `contracts/` (Anchor program)
- `backend/` (Express + TS server)
- `docs/` (optional, but we’re already using this brainstorm doc)

## 10) Build steps (MVP ordering)

1. Scaffold Anchor program:
  - `initialize_config`
  - `create_policy`
  - `settle_payment` with policy checks + USDC transfer + event emit
2. Scaffold Express backend:
  - config for Solana RPC connection + program ID + oracle keypair
  - policy endpoints
  - decision engine module (mock)
  - payment execute endpoint that submits tx
3. Connect MongoDB Atlas:
  - store policies and audit logs
4. End-to-end demo:
  - Create policy that blocks based on aml_threshold or blocked countries
  - Execute a “blocked” payment and show it fails on-chain with clear error
  - Execute an “allowed” payment and show successful USDC transfer + event/audit log

## 11) Demo narrative (what judges will see)

1. Institution creates a compliance policy: `max_amount=100000`, `aml_threshold=50`, `require_kyc=true`, `blocked_countries=[IR,KP]`
2. Decision engine runs:
  - AML score computed as 72 -> blocked
3. Backend submits `settle_payment` with the decision payload
4. Smart contract rejects (settlement layer enforcement)
5. Another attempt with AML score 40:
  - smart contract accepts and performs USDC transfer
6. MongoDB audit log shows the decision + tx signature

## 12) Open questions (we should resolve next)

1. What exactly do we mean by “Travel Rule” for MVP?
  - Required fields? Presented as hashes? Boolean flag?
2. How do we handle “multi-party simulation” in MVP?
  - Institution A -> Institution B -> Liquidity provider (can be a single on-chain settlement with extra off-chain routing metadata)
3. Which stablecoin mint do we use in devnet?
  - USDC real mint 
4. Do we want the backend to sign the execute tx as oracle signer, or do we want a separate oracle wallet workflow?

