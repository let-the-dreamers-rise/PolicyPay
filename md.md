.What is not really implemented yet (or only on paper)

Named partner layers are narrative, not modules. AMINA / Solstice / Keyrock appear as fields on the request (KYC flag, aml_score, VASP ids, Travel Rule flags). There is no separate “issuer API,” “risk engine,” or “router” service.

KYT in the hackathon sense. Requirements text stresses ongoing transaction monitoring. Your MVP is per-payment attestation + policy reasonable for the timeline, but not full KYT (patterning, velocity, graph, alerts).

Wire-format doc vs code. docs/wire-format.md mentions BCS and an idempotency_key; the live binding is manual 68-byte SHA-256, and idempotency is not in the program or payment routes (only mentioned in docs). Worth implementing idempotency  

Custody / Fireblocks angle. Todo mentions Fireblocks custody simulation; nothing in the tree reflects that.  

FX / richer Solstice story. Same as above: no separate FX or risk module only aml_score as a knob. 

Multi-party / routing demo. The architecture diagram (A → B → LP) is not a second on-chain path or extra instruction; it is positioning unless you add a thin simulation (e.g. two institutions, two policies, or a fake “route id” in logs).

Production-style safety (you should not claim this as “done” for real banks). Sending senderSecretKey / institutionSecretKey in JSON is acceptable for a local hackathon demo only. There is no API auth, no HSM, and Mongo policy can drift from on-chain policy if someone changes one side without the other—the chain wins at execute time, but the quote could disagree with reality until you re-sync or read policy from chain.

Audit trail = app DB, not chain indexing. Audit logs are written from the API after submit; you are not (from what is in auditLogger.ts) rebuilding history from ComplianceDecisionEvent. For a pilot narrative, “cryptographic audit” would want either event subscription or a clear line that the signature + on-chain program are the source of truth and Mongo is a cache.

Bottom line
You did the hard, judge-relevant part right: policy-enforced settlement on Solana with issuer + integrity hash + Travel Rule / AML / KYC hooks. What is not done is mostly presentation and depth: explicit simulated services, UI, idempotency/docs alignment, KYT breadth, and anything that sounds like custody or multi-hop routing unless you add a thin scripted layer. For StableHacks, being upfront—“enforcement is real on-chain; issuer, risk, and routing are simulated inputs”—is both accurate and defensible.