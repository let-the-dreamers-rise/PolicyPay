import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { demoRouteQuoteSchema } from "../validation/schemas";
import { fetchKeyrockRoute } from "../integrations/keyrock";
import { AuditLog } from "../models/AuditLog";
import { httpErrorFromUnknown } from "../services/paymentErrors";

const router = Router();

/**
 * Calls Keyrock (real HTTP), stores an audit note with route metadata, returns fields to feed orchestrated quote/execute.
 */
router.post("/route-and-quote", async (req: Request, res: Response) => {
  try {
    const body = demoRouteQuoteSchema.parse(req.body);
    const demoScenario = body.demoScenario ?? "A_to_B_via_LP";

    const partnerCtx = {
      amount: body.amount,
      senderCountry: body.senderCountry,
      receiverCountry: body.receiverCountry,
      policyOnChainAddress: body.policyOnChainAddress,
      senderPubkey: body.senderPubkey,
      recipientPubkey: body.recipientPubkey,
    };

    const route = await fetchKeyrockRoute(partnerCtx);

    const auditId = uuidv4();
    const pseudoDecisionId = `demo-route-${auditId}`;

    await AuditLog.create({
      auditId,
      decisionId: pseudoDecisionId,
      status: "confirmed",
      inputSnapshot: {
        kind: "demo_route_and_quote",
        demoScenario,
        partnerCtx,
        route,
      },
      eventData: {
        routeId: route.routeId ?? null,
        routeDescription: route.routeDescription ?? null,
      },
    });

    res.json({
      success: true,
      auditId,
      demoScenario,
      route: {
        routeId: route.routeId,
        routeDescription: route.routeDescription,
        senderVaspId: route.senderVaspId,
        receiverVaspId: route.receiverVaspId,
      },
      nextSteps: {
        quoteOrchestrated: "POST /api/payments/quote/orchestrated with the same policy, amount, countries, senderPubkey, recipientPubkey",
        executeOrchestrated:
          "POST /api/payments/execute/orchestrated after a successful orchestrated quote",
      },
    });
  } catch (err: unknown) {
    console.error("POST /demo/route-and-quote error:", err);
    const { status, message } = httpErrorFromUnknown(err);
    res.status(status).json({ success: false, error: message });
  }
});

export default router;
