const { secret } = require("../config/secret");
const stripe = require("stripe")(secret.stripe_key);
const Order = require("../model/Order");
const OrderTemp = require("../model/OrderTemp");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const crypto = require("crypto");
require("dotenv").config(); // To load environment variables

// create-payment-intent
exports.paymentIntent = async (req, res, next) => {
  try {
    const product = req.body;
    const price = Number(product.price);
    const amount = price * 100;
    // Create a PaymentIntent with the order amount and currency
    const paymentIntent = await stripe.paymentIntents.create({
      currency: "usd",
      amount: amount,
      payment_method_types: ["card"],
    });
    res.send({
      clientSecret: paymentIntent.client_secret,
    });
  } catch (error) {
    console.log(error);
    next(error)
  }
};

// addOrder
exports.addOrder = async (req, res, next) => {
  try {
    const orderItems = await Order.create(req.body);

    res.status(200).json({
      success: true,
      message: "Order added successfully",
      order: orderItems,
    });
  }
  catch (error) {
    console.log(error);
    next(error)
  }
};
// get Orders
exports.getOrders = async (req, res, next) => {
  try {
    const orderItems = await Order.find({}).populate('user');
    res.status(200).json({
      success: true,
      data: orderItems,
    });
  }
  catch (error) {
    console.log(error);
    next(error)
  }
};
// get Orders
exports.getSingleOrder = async (req, res, next) => {
  try {
    const orderItem = await Order.findById(req.params.id).populate('user');
    res.status(200).json(orderItem);
  }
  catch (error) {
    console.log(error);
    next(error)
  }
};

exports.updateOrderStatus = async (req, res) => {
  const newStatus = req.body.status;
  try {
    await Order.updateOne(
      {
        _id: req.params.id,
      },
      {
        $set: {
          status: newStatus,
        },
      }, { new: true })
    res.status(200).json({
      success: true,
      message: 'Status updated successfully',
    });
  }
  catch (error) {
    console.log(error);
    next(error)
  }
};

exports.paymentIntentPhonePay = async (req, res, next) => {

  const transactionid = "MT7850590068188104";
  const amount = Number(req?.body?.totalAmount);
  const totalAmount = amount * 100;
  const contact =req?.body?.contact;


  let reqBody = req.body;
  reqBody.paymentIntent = {merchantTransactionId: transactionid}
  const orderTempItems = await OrderTemp.create(req.body);
  // Payload definition
const payload = {
merchantId: process.env.NEXT_PUBLIC_MERCHANT_ID,
  merchantTransactionId: transactionid,
  merchantUserId: "MUID123",
  amount: totalAmount,
  redirectUrl: `${process.env.NEXT_PUBLIC_REDIRECTURL}${transactionid}`,
  redirectMode: "POST",
  callbackUrl: `${process.env.NEXT_PUBLIC_REDIRECTURL}${transactionid}`,
  mobileNumber: contact,
  order:req?.body,
  paymentInstrument: {
    type: "PAY_PAGE",
  },
};

// Convert payload to a JSON string
const dataPayload = JSON.stringify(payload);

// Encode the payload into Base64
const dataBase64 = Buffer.from(dataPayload).toString("base64");
console.log(dataBase64);

// Generate SHA256 checksum
const sha256 = (data) => {
  return crypto.createHash("sha256").update(data).digest("hex");
};

// Create the full URL string
const fullURL = dataBase64 + "/pg/v1/pay" + process.env.NEXT_PUBLIC_SALT_KEY;

// Generate the SHA256 hash of the full URL
const dataSha256 = sha256(fullURL);

// Combine the hash with the checksum version (1)
const checksum = dataSha256 + "###" + process.env.NEXT_PUBLIC_SALT_INDEX;
console.log("c====", checksum);

// PhonePe API URL for sandbox environment
const UAT_PAY_API_URL = process.env.NEXT_PUBLIC_UAT_PAY_API_URL;
const response = await axios.post(
  UAT_PAY_API_URL,
  {
    request: dataBase64,
  },
  {
    headers: {
      accept: "application/json",
      "Content-Type": "application/json",
      "X-VERIFY": checksum,
    },
  }
);
res.send({response:response.data})

};

const sha256 = (data) => {
  return crypto.createHash("sha256").update(data).digest("hex");
};

exports.paymentStatusPhonePay = async (req, res, next) => {
try{
// Directly access data from req.body
const status = req.body.code;
const merchantId = req.body.merchantId;
const transactionId = req.body.transactionId;

const st = `/pg/v1/status/${merchantId}/${transactionId}` + process.env.NEXT_PUBLIC_SALT_KEY;
const dataSha256 = sha256(st);

const checksum = dataSha256 + "###" + process.env.NEXT_PUBLIC_SALT_INDEX;
console.log(checksum);

const options = {
  method: "GET",
  url: `https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/status/${merchantId}/${transactionId}`,
  headers: {
    accept: "application/json",
    "Content-Type": "application/json",
    "X-VERIFY": checksum,
    "X-MERCHANT-ID": `${merchantId}`,
  },
};

// Check payment status
const response = await axios.request(options);
console.log("Response code:", response.data.code);

if (response.data.code === "PAYMENT_SUCCESS") {
  // Retrieve the order from OrderTemp based on the transaction ID and populate the user field
  const orderItemTemp = await OrderTemp.findOne({ paymentIntent: { merchantTransactionId: transactionId } }).populate('user');

  // If orderItemTemp is found, proceed
  if (orderItemTemp) {
      
      // Destructure all properties of orderItemTemp excluding _id
      let { _id, ...orderData } = orderItemTemp._doc; // `_doc` is used to access the raw document data
      orderData.paymentStatus =  "success";
      // Create a new Order with the retrieved data from OrderTemp (excluding _id)
      const newOrder = await Order.create(orderData);
      
      // Redirect to the order page with the new order's ID
      return res.redirect(301, `${process.env.STORE_URL}/order/${newOrder._id}`);
  } else {
     
    console.log("temp order not found for transactionId:",  transactionId)
      
      // Redirect to the order page with the new order's ID
      return res.redirect(301, `${process.env.STORE_URL}/order/12345`);
  }
 } else {
  orderData.paymentStatus =  "failed";
  return res.redirect(301, `${process.env.STORE_URL}/order/12345`);
}
}catch(e){
  return res.redirect(301, `${process.env.STORE_URL}/order/12345`);
}
  
};

