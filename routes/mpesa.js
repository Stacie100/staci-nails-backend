import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const router = express.Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const getToken = async () => {
  const auth = Buffer.from(
    `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
  ).toString("base64");

  const res = await axios.get(
    "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
    { headers: { Authorization: `Basic ${auth}` } }
  );
  return res.data.access_token;
};

router.post("/stk-push", async (req, res) => {
  try {
    const { phone, amount, bookingId } = req.body;

    const token = await getToken();

    const timestamp = new Date()
      .toISOString()
      .replace(/[^0-9]/g, "")
      .slice(0, 14);

    const password = Buffer.from(
      `${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`
    ).toString("base64");

    const payload = {
      BusinessShortCode: process.env.MPESA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: amount,
      PartyA: phone,
      PartyB: process.env.MPESA_SHORTCODE,
      PhoneNumber: phone,
      CallBackURL: process.env.MPESA_CALLBACK_URL,
      AccountReference: "StaciNails",
      TransactionDesc: `Booking ${bookingId}`,
    };

    const response = await axios.post(
      "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
      payload,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const checkoutRequestId = response.data.CheckoutRequestID;
    await supabase.from("payments").insert({
      checkout_request_id: checkoutRequestId,
      slot_id: bookingId,
      status: "pending",
    });

    res.json({ ...response.data, checkoutRequestId });

  } catch (err) {
    console.error("STK Push Error:", err.response?.data || err.message);
    res.status(500).json({ error: err.message, details: err.response?.data });
  }
});

router.post("/callback", async (req, res) => {
  console.log("📩 Callback received:", JSON.stringify(req.body, null, 2)); // 👈 added

  const { Body } = req.body;
  const cb = Body?.stkCallback;

  if (!cb) return res.json({ ResultCode: 0, ResultDesc: "Success" });

  const checkoutRequestId = cb.CheckoutRequestID;
  const success = cb.ResultCode === 0;

  if (success) {
    await supabase
      .from("payments")
      .update({ status: "confirmed" })
      .eq("checkout_request_id", checkoutRequestId);

    const { data: payment } = await supabase
      .from("payments")
      .select("slot_id")
      .eq("checkout_request_id", checkoutRequestId)
      .single();

    if (payment) {
      await supabase.from("slots").update({ booked: true }).eq("id", payment.slot_id);
    }

    console.log("✅ Payment confirmed:", checkoutRequestId);
  } else {
    await supabase
      .from("payments")
      .update({ status: "failed" })
      .eq("checkout_request_id", checkoutRequestId);

    console.log("❌ Payment failed:", cb.ResultDesc);
  }

  res.json({ ResultCode: 0, ResultDesc: "Success" });
});

router.get("/status/:checkoutRequestId", async (req, res) => {
  const { checkoutRequestId } = req.params;

  const { data, error } = await supabase
    .from("payments")
    .select("status, slot_id")
    .eq("checkout_request_id", checkoutRequestId)
    .single();

  if (error || !data) return res.status(404).json({ status: "not_found" });

  res.json({ status: data.status, slotId: data.slot_id });
});

export default router;