# PolicyPay X — Devnet Runbook

End-to-end steps to deploy the program, provision accounts, and run the demo on Solana devnet.

---

## Prerequisites

| Tool | Install |
|------|---------|
| Solana CLI | `sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"` |
| Anchor CLI | `cargo install --git https://github.com/coral-xyz/anchor avm --force && avm install latest && avm use latest` |
| Node.js >= 18 | https://nodejs.org |
| MongoDB Atlas | Create a free cluster at https://cloud.mongodb.com |

Set Solana to devnet:

```bash
solana config set --url https://api.devnet.solana.com
```

Generate a deployer wallet (if you don't have one):

```bash
solana-keygen new -o ~/.config/solana/id.json
solana airdrop 5
```

---

## 1. Build and deploy the Anchor program

```bash
cd contracts
npm install
anchor build
```

After build, get the program ID:

```bash
anchor keys list
```

Update:
- `contracts/Anchor.toml` → `[programs.devnet] policypay = "<PROGRAM_ID>"`
- `contracts/programs/policypay/src/lib.rs` → `declare_id!("<PROGRAM_ID>");`

Re-build and deploy:

```bash
anchor build
anchor deploy
```

Note the deployed program ID for the backend `.env`.

### `anchor deploy`: timeout *after* “Program confirmed on-chain”

If you see **`operation timed out`** right after **Program confirmed on-chain**, the **deploy already succeeded**. Anchor (or the CLI) is doing another request to devnet and the **public RPC** (`https://api.devnet.solana.com`) is slow, rate-limited, or dropped your connection—common from WSL or busy networks.

1. **Verify the program is there:**

   ```bash
   solana program show yourkey
   ```

   If this prints program details, you are done with deploy.

2. **Reduce flakes next time:** point the CLI at a **sturdier devnet RPC** (Helius, QuickNode, Alchemy, etc.), then redeploy/upgrade as usual:

   ```bash
   solana config set --url https://devnet.helius-rpc.com/?api-key=YOUR_KEY
   # or keep default and only set for Anchor:
   export ANCHOR_PROVIDER_URL="https://devnet.helius-rpc.com/?api-key=YOUR_KEY"
   ```

3. **Retry** `anchor deploy` only if `program show` says the program is missing (rare if you saw “confirmed”).

---

## 2. Generate compliance issuer keypair

This keypair **must match** the `compliance_issuer` pubkey you pass into `initialize_config` on-chain. The backend signs settlement txs as this issuer.

From repo root (or any folder; adjust paths):

```bash
# Create a new keypair file (do NOT commit it — it is in .gitignore if named compliance-issuer.json at repo root)
solana-keygen new -o compliance-issuer.json --no-bip39-passphrase

# Fund it on devnet (tx fees). Use the pubkey printed above:
solana airdrop 1 <COMPLIANCE_ISSUER_PUBKEY>
# Or one step: solana airdrop 1 $(solana-keygen pubkey compliance-issuer.json)
```

Show the public key (for `initialize_config`):

```bash
solana-keygen pubkey compliance-issuer.json
```

Export the **base58 secret** for `COMPLIANCE_ISSUER_SECRET_KEY` in `backend/.env` (run from the directory that contains `compliance-issuer.json`):

```bash
cd /path/to/PolicyPay   # or contracts/, same folder as the json
node -e "const bs58=require('bs58');const k=require('./compliance-issuer.json');console.log(bs58.encode(Buffer.from(k)))"
```

If `bs58` is missing: `npm install bs58` in a folder with `package.json`, or use `cd backend && node -e "..."` with `require('../compliance-issuer.json')` and `bs58` from backend deps.

**`BACKEND_API_KEY`** (optional HTTP auth for `/api/*`): any random secret you choose, not a Solana key. Generate e.g.:

```bash
openssl rand -hex 32
```

---

## 3. Initialize on-chain config

Use the Anchor test or a script:

```bash
cd contracts
anchor test --skip-local-validator
```

Or call `initialize_config` from the backend (a one-time admin operation).

You need:
- `admin` = your deployer wallet
- `compliance_issuer` = public key from `compliance-issuer.json`
- `usdc_mint` = the devnet USDC mint address

Devnet USDC mint (Circle): `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`

If that mint is unavailable, create a custom SPL token mint:

```bash
spl-token create-token --decimals 6
```

---

## 4. Configure backend `.env`

Copy `.env.example` to `.env` and fill in:

```env
PORT=3000
MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/policypay?retryWrites=true&w=majority
SOLANA_RPC_URL=https://api.devnet.solana.com
PROGRAM_ID=<your program ID>
IDL_PATH=../contracts/target/idl/policypay.json
COMPLIANCE_ISSUER_SECRET_KEY=<base58 secret key>
```

---

## 5. Start the backend

```bash
cd backend
pnpm install
pnpm run dev
```

Verify: `curl http://localhost:3000/health`

---

## 6. Create a policy

Generate an institution keypair:

```bash
solana-keygen new -o institution.json --no-bip39-passphrase
solana airdrop 2 $(solana-keygen pubkey institution.json)
```

Export its base58 secret key, then:

```bash
curl -X POST http://localhost:3000/api/policies \
  -H "Content-Type: application/json" \
  -d '{
    "institutionId": "AMINA-CH",
    "institutionSecretKey": "<base58 secret key>",
    "policyId": 1,
    "maxAmount": 1000000,
    "requireKyc": true,
    "amlThreshold": 50,
    "blockedCountries": [100, 101],
    "travelRuleRequired": true,
    "travelRuleRequiredAmount": 10000
  }'
```

Note the `policyAddress` from the response.

---

## 7. Provision sender and recipient token accounts

```bash
# Generate sender
solana-keygen new -o sender.json --no-bip39-passphrase
solana airdrop 2 $(solana-keygen pubkey sender.json)

# Create associated token accounts
spl-token create-account <USDC_MINT> --owner $(solana-keygen pubkey sender.json)
spl-token create-account <USDC_MINT> --owner $(solana-keygen pubkey recipient.json)

# Mint test USDC to sender (if using custom mint)
spl-token mint <USDC_MINT> 10000000 --recipient <SENDER_TOKEN_ACCOUNT>
```

---

## 8. Demo: compliant payment (allowed)

```bash
curl -X POST http://localhost:3000/api/payments/execute \
  -H "Content-Type: application/json" \
  -d '{
    "policyOnChainAddress": "<POLICY_ADDRESS>",
    "amount": 5000,
    "senderCountry": 1,
    "receiverCountry": 2,
    "recipientPubkey": "<RECIPIENT_PUBKEY>",
    "kycVerified": true,
    "amlScore": 30,
    "senderVaspId": "0101010101010101010101010101010101010101010101010101010101010101",
    "receiverVaspId": "0202020202020202020202020202020202020202020202020202020202020202",
    "travelRuleFieldsPresent": true,
    "travelRulePayloadVersion": 1,
    "senderSecretKey": "<SENDER_BASE58_SECRET_KEY>"
  }'
```

Expected: `"allowed": true`, `"txSignature": "..."`.

---

## 9. Demo: non-compliant payment (blocked)

Same request but with `"amlScore": 72`:

```bash
curl -X POST http://localhost:3000/api/payments/execute \
  -H "Content-Type: application/json" \
  -d '{
    "policyOnChainAddress": "<POLICY_ADDRESS>",
    "amount": 5000,
    "senderCountry": 1,
    "receiverCountry": 2,
    "recipientPubkey": "<RECIPIENT_PUBKEY>",
    "kycVerified": true,
    "amlScore": 72,
    "senderVaspId": "0101010101010101010101010101010101010101010101010101010101010101",
    "receiverVaspId": "0202020202020202020202020202020202020202020202020202020202020202",
    "travelRuleFieldsPresent": true,
    "travelRulePayloadVersion": 1,
    "senderSecretKey": "<SENDER_BASE58_SECRET_KEY>"
  }'
```

Expected: `"allowed": false`, `"reason": "AML score exceeds threshold"`.

---

## 10. Verify audit log

```bash
curl http://localhost:3000/api/audit
curl http://localhost:3000/api/audit/<AUDIT_ID>
```

You should see both decisions with their respective `allowed` status, payload hashes, and on-chain tx signatures for the successful settlement.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `anchor build` fails on Windows | Use WSL or Docker with a Linux-based Anchor image |
| Insufficient SOL | `solana airdrop 5` (may need multiple calls; devnet faucet has rate limits) |
| IDL not found by backend | Ensure `IDL_PATH` in `.env` points to `contracts/target/idl/policypay.json` |
| MongoDB connection error | Verify Atlas connection string and IP whitelist (allow `0.0.0.0/0` for dev) |
