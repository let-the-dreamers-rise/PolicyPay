import dotenv from "dotenv";
dotenv.config();

export const config = {
  PORT: parseInt(process.env.PORT || "3000", 10),
  MONGODB_URI:
    process.env.MONGODB_URI || "mongodb://localhost:27017/policypay",
  SOLANA_RPC_URL: process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
  PROGRAM_ID: process.env.PROGRAM_ID || "",
  COMPLIANCE_ISSUER_SECRET_KEY: process.env.COMPLIANCE_ISSUER_SECRET_KEY || "",
  IDL_PATH: process.env.IDL_PATH || "../contracts/target/idl/policypay.json",
} as const;
