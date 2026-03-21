import express from "express";
import cors from "cors";
import { config } from "./config";
import { connectDB } from "./db";
import { requireApiKey } from "./middleware/apiKey";
import policiesRouter from "./routes/policies";
import paymentsRouter from "./routes/payments";
import auditRouter from "./routes/audit";
import demoRouter from "./routes/demo";

const app = express();

// Allow any browser origin (third-party / hackathon frontends). Reflects `Origin` per request.
app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-api-key"],
  }),
);
app.use(express.json());

app.use("/api", requireApiKey);
app.use("/api/policies", policiesRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/audit", auditRouter);
app.use("/api/demo", demoRouter);

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
