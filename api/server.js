require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const { getAvailableSlots, createBooking } = require("../lib/calendar");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

// Diagnostic: log which env vars are set (not their values)
console.log("ENV CHECK:", {
  GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: !!process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI: !!process.env.GOOGLE_REDIRECT_URI,
  GOOGLE_REFRESH_TOKEN: !!process.env.GOOGLE_REFRESH_TOKEN,
  GOOGLE_CALENDAR_ID: !!process.env.GOOGLE_CALENDAR_ID,
});

// ============================================================
// GET /api/availability?date=2026-04-10
// Free endpoint — returns available 30-min slots for a date
// ============================================================
app.get("/api/availability", async (req, res) => {
  try {
    const { date } = req.query;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: "Provide date as YYYY-MM-DD" });
    }

    const slots = await getAvailableSlots(date);
    return res.json({ date, slots, timezone: "America/Los_Angeles" });
  } catch (err) {
    console.error("Availability error:", err.message, err.response?.data || err.code || "");
    return res.status(500).json({ error: "Failed to fetch availability", detail: err.message });
  }
});

// ============================================================
// POST /api/book
// x402 protected — $1 USDC to book a slot
//
// For MVP: The x402 middleware will gate this endpoint.
// If no valid payment header → 402 Payment Required.
// If payment verified → this handler runs and creates the event.
// ============================================================

// --- x402 middleware placeholder ---
// In production, this uses @x402/express middleware.
// For local dev/testing without blockchain, we use a bypass flag.
const USE_X402 = process.env.ENABLE_X402 === "true";

if (USE_X402) {
  // Dynamic import to avoid crash if package not installed
  try {
    const { paymentMiddleware } = require("@x402/express");
    app.use(
      "/api/book",
      paymentMiddleware({
        "POST /api/book": {
          accepts: [
            {
              scheme: "exact",
              price: "$1",
              network: "eip155:84532", // Base Sepolia testnet
              payTo: process.env.WALLET_ADDRESS,
            },
          ],
          description: "Book a 30-minute paid consultation slot",
        },
      })
    );
    console.log("x402 payment middleware ACTIVE (Base Sepolia)");
  } catch (err) {
    console.warn("x402 packages not installed, running without payment gate");
  }
} else {
  console.log("x402 DISABLED — booking endpoint is open (dev mode)");
}

app.post("/api/book", async (req, res) => {
  try {
    const { slot, name, email, phone, purpose } = req.body;

    // Validate inputs
    if (!slot || !name || !email || !phone || !purpose) {
      return res.status(400).json({
        error: "Missing required fields: slot, name, email, phone, purpose",
      });
    }

    // Verify slot is still available (prevent race conditions)
    const dateStr = slot.split("T")[0];
    const available = await getAvailableSlots(dateStr);
    const slotStillOpen = available.some((s) => s.start === slot);

    if (!slotStillOpen) {
      return res.status(409).json({
        error: "Slot no longer available. Please choose another.",
      });
    }

    // Create the calendar event
    const event = await createBooking({
      slotStart: slot,
      name,
      email,
      phone,
      purpose,
    });

    return res.json({
      success: true,
      message: "Booking confirmed!",
      event: {
        id: event.id,
        summary: event.summary,
        start: event.start,
        end: event.end,
        htmlLink: event.htmlLink,
      },
    });
  } catch (err) {
    console.error("Booking error:", err.message);
    return res.status(500).json({ error: "Failed to create booking" });
  }
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", x402: USE_X402 ? "enabled" : "disabled" });
});

// SPA fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// Vercel serverless: export the Express app
// Local dev: listen on PORT
if (process.env.VERCEL) {
  module.exports = app;
} else {
  const PORT = process.env.PORT || 4021;
  app.listen(PORT, () => {
    console.log(`x402 Calendar running on http://localhost:${PORT}`);
  });
}
