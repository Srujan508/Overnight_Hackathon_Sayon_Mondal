// routes/transaction.routes.js
import express from "express";
import axios from "axios";

const router = express.Router();

// Python FastAPI endpoint
const PYTHON_FRAUD_API =
    process.env.FRAUD_API_URL || "http://127.0.0.1:8000/predict-fraud";

/**
 * GET /api/transactions/health
 * Simple health check for this router
 */
router.get("/health", (req, res) => {
    res.json({ ok: true, message: "Transaction routes are live ✅" });
});

/**
 * POST /api/transactions/evaluate
 * Hybrid Rule + ML fraud evaluation
 */
router.post("/evaluate", async (req, res, next) => {
    try {
        const txn = req.body;

        // 1️⃣ Required fields for ML model
        const requiredFields = [
            "amount",
            "is_new_counterparty",
            "device_change",
            "location_change",
            "channel",
            "page_context",
            "requires_pin",
            "anomaly_score",
            "sender_in_degree_7d",
            "sender_out_degree_7d",
            "sender_in_out_ratio",
            "fake_claim_count_user_7d",
            "is_screen_recording_on",
            "is_remote_access_app_running",
            "is_call_active_during_payment",
        ];

        for (const f of requiredFields) {
            if (txn[f] === undefined) {
                return res.status(400).json({
                    success: false,
                    error: `Missing field in request body: ${f}`,
                });
            }
        }

        // 2️⃣ Rule Engine (deterministic logic)
        let ruleDecision = "ALLOW";
        let ruleReason = null;

        // Example hard rule: refund scam
        if (
            txn.page_context === "refund_page" &&
            txn.channel === "collect" &&
            txn.amount > 20000
        ) {
            ruleDecision = "BLOCK";
            ruleReason =
                "RuleEngine: Potential refund scam via COLLECT on refund page";
        }

        // If rule says BLOCK, skip ML
        if (ruleDecision === "BLOCK") {
            return res.json({
                success: true,
                source: "RULE_ENGINE",
                rule_decision: ruleDecision,
                rule_reason: ruleReason,
                ml_used: false,
            });
        }

        // 3️⃣ Call Python FastAPI ML model
        const mlResponse = await axios.post(PYTHON_FRAUD_API, txn);
        const mlData = mlResponse.data;

        // 4️⃣ Combine Rule + ML → final decision
        const finalDecision = mlData.decision; // BLOCK_AND_ALERT / WARN / ALLOW
        const finalRiskLevel = mlData.risk_level;

        return res.json({
            success: true,
            source: "HYBRID_ENGINE",
            rule_decision: ruleDecision,
            rule_reason: ruleReason,
            ml_used: true,
            ml_result: mlData,
            final_decision: finalDecision,
            final_risk_level: finalRiskLevel,
        });
    } catch (err) {
        console.error("Error in /api/transactions/evaluate:", err.message);
        if (err.response) {
            console.error("Python API error:", err.response.data);
        }
        next(err); // let global error handler deal with it
    }
});

export default router;
