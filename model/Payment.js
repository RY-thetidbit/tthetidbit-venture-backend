const mongoose = require("mongoose");

const PaymentSchema = new mongoose.Schema({
  transactionId: String,
  amount: Number,
  status: String,
});

const Payment = mongoose.model("Payment", PaymentSchema);
module.exports = Payment;
