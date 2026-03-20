import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, type Idl } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { readFileSync } from "fs";
import bs58 from "bs58";
import { config } from "../config";
import { computePayloadHash, AttestationPayload } from "./compliance";

let _provider: AnchorProvider | null = null;
let _program: Program<Idl> | null = null;
let _issuerKeypair: Keypair | null = null;

export function getComplianceIssuerKeypair(): Keypair {
  if (!_issuerKeypair) {
    const raw = config.COMPLIANCE_ISSUER_SECRET_KEY;
    if (raw.startsWith("[")) {
      _issuerKeypair = Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(raw)),
      );
    } else {
      _issuerKeypair = Keypair.fromSecretKey(bs58.decode(raw));
    }
  }
  return _issuerKeypair;
}

export function getProvider(): AnchorProvider {
  if (!_provider) {
    const connection = new Connection(config.SOLANA_RPC_URL, "confirmed");
    const wallet = new anchor.Wallet(getComplianceIssuerKeypair());
    _provider = new AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });
  }
  return _provider;
}

export function getProgram(): Program<Idl> {
  if (!_program) {
    const idl = JSON.parse(readFileSync(config.IDL_PATH, "utf-8")) as Idl;
    // Anchor 0.30+ JS client: Program(idl, provider). Program id must be on the IDL.
    if (config.PROGRAM_ID) {
      (idl as Idl & { address?: string }).address = config.PROGRAM_ID;
    }
    _program = new Program(idl, getProvider());
  }
  return _program;
}

export function getConfigPda(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    new PublicKey(config.PROGRAM_ID),
  );
  return pda;
}

export function getPolicyPda(
  institutionPubkey: PublicKey,
  policyId: number,
): PublicKey {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(policyId));
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("policy"), institutionPubkey.toBuffer(), buf],
    new PublicKey(config.PROGRAM_ID),
  );
  return pda;
}

// ---- Transactions ----

export async function initializeConfigOnChain(
  adminKeypair: Keypair,
  complianceIssuerPubkey: PublicKey,
  usdcMint: PublicKey,
): Promise<string> {
  const prog = getProgram();
  const configPda = getConfigPda();

  return prog.methods
    .initializeConfig(complianceIssuerPubkey, usdcMint)
    .accounts({
      config: configPda,
      admin: adminKeypair.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([adminKeypair])
    .rpc();
}

export async function createPolicyOnChain(params: {
  institutionKeypair: Keypair;
  policyId: number;
  maxAmount: number;
  requireKyc: boolean;
  amlThreshold: number;
  blockedCountries: number[];
  travelRuleRequired: boolean;
  travelRuleRequiredAmount: number;
}): Promise<string> {
  const prog = getProgram();
  const configPda = getConfigPda();
  const policyPda = getPolicyPda(
    params.institutionKeypair.publicKey,
    params.policyId,
  );

  const blocked = [...params.blockedCountries];
  while (blocked.length < 10) blocked.push(0);

  return prog.methods
    .createPolicy(
      new anchor.BN(params.policyId),
      new anchor.BN(params.maxAmount),
      params.requireKyc,
      params.amlThreshold,
      blocked,
      params.travelRuleRequired,
      new anchor.BN(params.travelRuleRequiredAmount),
    )
    .accounts({
      config: configPda,
      policy: policyPda,
      institution: params.institutionKeypair.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([params.institutionKeypair])
    .rpc();
}

export async function settlePaymentOnChain(params: {
  policyAddress: PublicKey;
  senderKeypair: Keypair;
  senderTokenAccount: PublicKey;
  recipientTokenAccount: PublicKey;
  amount: number;
  senderCountry: number;
  receiverCountry: number;
  attestation: AttestationPayload;
}): Promise<string> {
  const prog = getProgram();
  const configPda = getConfigPda();
  const issuer = getComplianceIssuerKeypair();

  const payloadHash = computePayloadHash(params.attestation);

  return prog.methods
    .settlePayment(
      new anchor.BN(params.amount),
      params.senderCountry,
      params.receiverCountry,
      params.attestation.kycVerified,
      params.attestation.amlScore,
      Array.from(params.attestation.senderVaspId),
      Array.from(params.attestation.receiverVaspId),
      params.attestation.travelRuleFieldsPresent,
      params.attestation.travelRulePayloadVersion,
      Array.from(payloadHash),
    )
    .accounts({
      config: configPda,
      policy: params.policyAddress,
      complianceIssuer: issuer.publicKey,
      senderOwner: params.senderKeypair.publicKey,
      senderTokenAccount: params.senderTokenAccount,
      recipientTokenAccount: params.recipientTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([issuer, params.senderKeypair])
    .rpc();
}
