//! PolicyPay X — Anchor program.
//!
//! `unexpected_cfgs`: Anchor and `solana_program_entrypoint` expand macros that use
//! `cfg(feature = "...")` flags not declared here; we declare those features in `Cargo.toml`
//! and allow this lint so rustc’s `check-cfg` stays quiet until upstream aligns fully.
#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use sha2::{Digest, Sha256};

// Update after running: anchor keys list
declare_id!("6R1i2wgpvEZXNVxYMdUqC4KKcAszacuZnGTaPSL6TruC");

const MAX_BLOCKED_COUNTRIES: usize = 10;

#[program]
pub mod policypay {
    use super::*;

    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        compliance_issuer: Pubkey,
        usdc_mint: Pubkey,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.admin = ctx.accounts.admin.key();
        config.compliance_issuer = compliance_issuer;
        config.usdc_mint = usdc_mint;
        config.bump = ctx.bumps.config;
        Ok(())
    }

    pub fn update_config(
        ctx: Context<UpdateConfig>,
        compliance_issuer: Pubkey,
        usdc_mint: Pubkey,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.compliance_issuer = compliance_issuer;
        config.usdc_mint = usdc_mint;
        Ok(())
    }

    pub fn create_policy(
        ctx: Context<CreatePolicy>,
        policy_id: u64,
        max_amount: u64,
        require_kyc: bool,
        aml_threshold: u8,
        blocked_countries: [u8; MAX_BLOCKED_COUNTRIES],
        travel_rule_required: bool,
        travel_rule_required_amount: u64,
    ) -> Result<()> {
        let policy = &mut ctx.accounts.policy;
        policy.institution = ctx.accounts.institution.key();
        policy.policy_id = policy_id;
        policy.max_amount = max_amount;
        policy.require_kyc = require_kyc;
        policy.aml_threshold = aml_threshold;
        policy.blocked_countries = blocked_countries;
        policy.travel_rule_required = travel_rule_required;
        policy.travel_rule_required_amount = travel_rule_required_amount;
        policy.bump = ctx.bumps.policy;
        Ok(())
    }

    pub fn settle_payment(
        ctx: Context<SettlePayment>,
        amount: u64,
        sender_country: u8,
        receiver_country: u8,
        kyc_verified: bool,
        aml_score: u8,
        sender_vasp_id: [u8; 32],
        receiver_vasp_id: [u8; 32],
        travel_rule_fields_present: bool,
        travel_rule_payload_version: u8,
        payload_hash: [u8; 32],
    ) -> Result<()> {
        let config = &ctx.accounts.config;
        let policy = &ctx.accounts.policy;

        // 1. Verify compliance issuer matches the one stored in config
        require!(
            ctx.accounts.compliance_issuer.key() == config.compliance_issuer,
            PolicyPayError::UnauthorizedIssuer
        );

        // 2. Verify attestation payload hash integrity
        let computed = compute_payload_hash(
            kyc_verified,
            aml_score,
            &sender_vasp_id,
            &receiver_vasp_id,
            travel_rule_fields_present,
            travel_rule_payload_version,
        );
        require!(computed == payload_hash, PolicyPayError::PayloadHashMismatch);

        // 3. Enforce max amount
        require!(
            amount <= policy.max_amount,
            PolicyPayError::AmountExceedsLimit
        );

        // 4. Enforce blocked countries (both sender and receiver)
        for &code in policy.blocked_countries.iter() {
            if code == 0 {
                continue;
            }
            require!(
                sender_country != code,
                PolicyPayError::SenderCountryBlocked
            );
            require!(
                receiver_country != code,
                PolicyPayError::ReceiverCountryBlocked
            );
        }

        // 5. Enforce KYC
        if policy.require_kyc {
            require!(kyc_verified, PolicyPayError::KycNotVerified);
        }

        // 6. Enforce AML (block when score exceeds threshold)
        require!(
            aml_score <= policy.aml_threshold,
            PolicyPayError::AmlScoreExceedsThreshold
        );

        // 7. Enforce Travel Rule
        if policy.travel_rule_required && amount >= policy.travel_rule_required_amount {
            require!(
                travel_rule_fields_present,
                PolicyPayError::TravelRuleFieldsMissing
            );
            require!(
                sender_vasp_id != [0u8; 32],
                PolicyPayError::TravelRuleSenderVaspMissing
            );
            require!(
                receiver_vasp_id != [0u8; 32],
                PolicyPayError::TravelRuleReceiverVaspMissing
            );
        }

        // 8. Execute USDC transfer via CPI
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.sender_token_account.to_account_info(),
                    to: ctx.accounts.recipient_token_account.to_account_info(),
                    authority: ctx.accounts.sender_owner.to_account_info(),
                },
            ),
            amount,
        )?;

        // 9. Emit compliance decision event for off-chain indexing
        emit!(ComplianceDecisionEvent {
            policy: policy.key(),
            amount,
            allowed: true,
            kyc_verified,
            aml_score,
            sender_country,
            receiver_country,
            sender_vasp_id,
            receiver_vasp_id,
            payload_hash,
        });

        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn compute_payload_hash(
    kyc_verified: bool,
    aml_score: u8,
    sender_vasp_id: &[u8; 32],
    receiver_vasp_id: &[u8; 32],
    travel_rule_fields_present: bool,
    travel_rule_payload_version: u8,
) -> [u8; 32] {
    let mut data = Vec::with_capacity(68);
    data.push(kyc_verified as u8);
    data.push(aml_score);
    data.extend_from_slice(sender_vasp_id);
    data.extend_from_slice(receiver_vasp_id);
    data.push(travel_rule_fields_present as u8);
    data.push(travel_rule_payload_version);
    // Solana 2.x / Anchor 0.32: `solana_program::hash` is not re-exported here; use SHA-256
    // (must match backend `crypto.createHash("sha256")` in compliance.ts).
    Sha256::digest(&data).into()
}

// ---------------------------------------------------------------------------
// Account state
// ---------------------------------------------------------------------------

#[account]
pub struct ProgramConfig {
    pub admin: Pubkey,
    pub compliance_issuer: Pubkey,
    pub usdc_mint: Pubkey,
    pub bump: u8,
}

impl ProgramConfig {
    pub const SIZE: usize = 8 + 32 + 32 + 32 + 1;
}

#[account]
pub struct Policy {
    pub institution: Pubkey,
    pub policy_id: u64,
    pub max_amount: u64,
    pub require_kyc: bool,
    pub aml_threshold: u8,
    pub blocked_countries: [u8; MAX_BLOCKED_COUNTRIES],
    pub travel_rule_required: bool,
    pub travel_rule_required_amount: u64,
    pub bump: u8,
}

impl Policy {
    pub const SIZE: usize = 8 + 32 + 8 + 8 + 1 + 1 + MAX_BLOCKED_COUNTRIES + 1 + 8 + 1;
}

// ---------------------------------------------------------------------------
// Instruction contexts
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(
        init,
        payer = admin,
        space = ProgramConfig::SIZE,
        seeds = [b"config"],
        bump,
    )]
    pub config: Account<'info, ProgramConfig>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump,
        has_one = admin,
    )]
    pub config: Account<'info, ProgramConfig>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(policy_id: u64)]
pub struct CreatePolicy<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, ProgramConfig>,
    #[account(
        init,
        payer = institution,
        space = Policy::SIZE,
        seeds = [b"policy", institution.key().as_ref(), &policy_id.to_le_bytes()],
        bump,
    )]
    pub policy: Account<'info, Policy>,
    #[account(mut)]
    pub institution: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettlePayment<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, ProgramConfig>,
    #[account(
        seeds = [
            b"policy",
            policy.institution.as_ref(),
            &policy.policy_id.to_le_bytes(),
        ],
        bump = policy.bump,
    )]
    pub policy: Account<'info, Policy>,
    pub compliance_issuer: Signer<'info>,
    #[account(mut)]
    pub sender_owner: Signer<'info>,
    #[account(
        mut,
        constraint = sender_token_account.mint == config.usdc_mint @ PolicyPayError::InvalidMint,
        constraint = sender_token_account.owner == sender_owner.key() @ PolicyPayError::InvalidTokenOwner,
    )]
    pub sender_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = recipient_token_account.mint == config.usdc_mint @ PolicyPayError::InvalidMint,
    )]
    pub recipient_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

#[event]
pub struct ComplianceDecisionEvent {
    pub policy: Pubkey,
    pub amount: u64,
    pub allowed: bool,
    pub kyc_verified: bool,
    pub aml_score: u8,
    pub sender_country: u8,
    pub receiver_country: u8,
    pub sender_vasp_id: [u8; 32],
    pub receiver_vasp_id: [u8; 32],
    pub payload_hash: [u8; 32],
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[error_code]
pub enum PolicyPayError {
    #[msg("Unauthorized compliance issuer")]
    UnauthorizedIssuer,
    #[msg("Payload hash does not match computed hash")]
    PayloadHashMismatch,
    #[msg("Amount exceeds policy maximum")]
    AmountExceedsLimit,
    #[msg("Sender country is blocked")]
    SenderCountryBlocked,
    #[msg("Receiver country is blocked")]
    ReceiverCountryBlocked,
    #[msg("KYC verification required but not provided")]
    KycNotVerified,
    #[msg("AML score exceeds policy threshold")]
    AmlScoreExceedsThreshold,
    #[msg("Travel Rule required fields missing")]
    TravelRuleFieldsMissing,
    #[msg("Travel Rule sender VASP ID missing")]
    TravelRuleSenderVaspMissing,
    #[msg("Travel Rule receiver VASP ID missing")]
    TravelRuleReceiverVaspMissing,
    #[msg("Invalid token mint")]
    InvalidMint,
    #[msg("Token account owner mismatch")]
    InvalidTokenOwner,
}
