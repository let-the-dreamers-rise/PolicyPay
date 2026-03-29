import mongoose from "mongoose";
import { connectDB } from "../db";
import { seedLocalData } from "../services/localSeed";

async function main() {
  await connectDB();
  await seedLocalData();

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Local seed failed:", error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
