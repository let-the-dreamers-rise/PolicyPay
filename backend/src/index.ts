import express from "express";
import cors from "cors";
import { config } from "./config";
import { connectDB } from "./db";
import policiesRouter from "./routes/policies";
import paymentsRouter from "./routes/payments";
import auditRouter from "./routes/audit";

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/policies", policiesRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/audit", auditRouter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "PolicyPay X" });
});

async function main() {
  await connectDB();
  app.listen(config.PORT, () => {
    console.log(`PolicyPay X backend listening on port ${config.PORT}`);
  });
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
