PolicyPay X
One Line
A programmable compliance and settlement protocol for institutional stablecoin payments 
on Solana
Problem
Institutional stablecoin adoption is limited by:
• Lack of enforced KYC / AML / Travel Rule
• Manual compliance workflows
• No programmable policy control
• Poor auditability and coordination across institutions
Solution
PolicyPay X introduces:
A programmable policy layer that enforces compliance
directly at the settlement layer
Institutions define rules → system validates → transaction executes only if compliant
Core Innovation
Programmable Policy Engine
• Institutions define compliance rules dynamically
• Policies are enforced during transaction execution
• Compliance becomes programmable and automatic
Example Policy
{
 "max_amount": 100000,
 "aml_threshold": 50,
 "require_kyc": true,
 "blocked_countries": ["IR", "KP"]
}
Decision Engine Output
KYC: ✔ VERIFIED
AML Score: 72 
FX Risk: MEDIUM
→ DECISION: BLOCKED
System Architecture
 1. Protocol Layer (Solana)
• Policy enforcement
• Transaction execution
• Audit logging
 2. Compliance Layer (AMINA-aligned)
• KYC verification (mock)
• AML scoring
• Policy definition
 3. Data & Risk Layer (Solstice-aligned)
• FX volatility signals
• risk scoring
• decision enhancement
 4. Liquidity Layer (Keyrock-simulated)
• routing logic
• best execution path
 5. Settlement Layer (Solana)
• USDC transfer
• final execution
• on-chain logs
End-to-End Flow
Institution A
 ↓
Policy Engine (Compliance rules)
 ↓
Risk Engine (FX + AML)
 ↓
Routing (Liquidity provider simulation)
 ↓
Settlement (Solana)
 ↓
Audit Log
MVP Scope
Core Features
• Policy creation
• Compliance validation
• Payment execution
• Decision engine UI
• Audit logs
Bonus Features
• FX risk scoring
• multi-party simulation
• routing logic
Multi-Party Simulation
Institution A → Institution B → Liquidity Provider
Demonstrates:
• cross-border flow
• institutional interaction
• network-level coordination
Why This Wins
Full Hackathon Alignment
• KYC ✔
• AML ✔
• Travel Rule ✔
Institutional Relevance
• policy enforcement
• compliance automation
• auditability
Partner Alignment
Partner Role
AMINA compliance rules
Solana settlement layer
Solstice data + risk
Keyrock liquidity routing
Fireblocks custody simulation
Clear Demo Flow
Define → Validate → Decide → Execute
Final Pitch
We built PolicyPay X, a programmable compliance and settlement protocol for institutional 
stablecoin payments.
Institutions define policies like AML thresholds, transaction limits, and KYC requirements.
Our system validates and enforces these rules using real-time risk signals before executing 
transactions on Solana.
This transforms stablecoin payments into a compliant, auditable, and programmable 
financial system.
Key Differentiator
Compliance is not checked
→ It is enforced at the settlement layer
Positioning
Category Value
Type Infrastructure Protocol
Focus Programmable Payments
Users Institutions / Banks
Tech Solana + Node
Final Statement
PolicyPay X turns stablecoin payments into a programmable financial system
where compliance is enforced, not optional