const express = require("express");
const {
  paymentIntent,
  addOrder,
  getOrders,
  updateOrderStatus,
  getSingleOrder,
  paymentIntentPhonePay,
  paymentStatusPhonePay
} = require("../controller/order.controller");

// router
const router = express.Router();

// get orders
router.get("/orders", getOrders);
// single order
router.get("/:id", getSingleOrder);
// add a create payment intent
router.post("/create-payment-intent", paymentIntent);
// save Order
router.post("/saveOrder", addOrder);
// update status
router.patch("/update-status/:id", updateOrderStatus);
// add a create payment intent phonepay
router.post("/create-payment-intent-phonePay", paymentIntentPhonePay);
// add a create payment intent phonepay
router.get("/status/:id", paymentStatusPhonePay);

module.exports = router;
