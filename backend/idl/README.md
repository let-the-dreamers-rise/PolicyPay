# Anchor IDL (`policypay.json`)

This file is the **Interface Definition Language** JSON for the PolicyPay program. It is **deterministic**: anyone with the same program source and Anchor version can reproduce it by running in `contracts/`:

```bash
anchor build
```

The canonical build output is `contracts/target/idl/policypay.json`. We keep a copy here so:

- Clones work without a local Anchor build (backend only needs this JSON).
- `contracts/target/` can stay gitignored as a whole build directory.

After you change the on-chain program, rebuild and refresh this copy:

```bash
# from repo root (Windows PowerShell example)
Copy-Item contracts/target/idl/policypay.json backend/idl/policypay.json
```

Point `IDL_PATH` in `.env` at this file (e.g. `IDL_PATH=./idl/policypay.json` when running the backend from `backend/`).
