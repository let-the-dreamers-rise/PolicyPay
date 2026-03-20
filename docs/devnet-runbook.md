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

---

## 2. Generate compliance issuer keypair

```bash
 
```

Export the base58 secret key for the backend env:

```bash
# Node one-liner to convert JSON keypair to base58
node -e "const bs58=require('bs58');const k=require('./compliance-issuer.json');console.log(bs58.encode(Buffer.from(k)))"
```

Store the output as `COMPLIANCE_ISSUER_SECRET_KEY` in `backend/.env`.

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
npm install
npm run dev
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
