const { secret } = require("../config/secret");
const stripe = require("stripe")(secret.stripe_key);
const Order = require("../model/Order");
const OrderTemp = require("../model/OrderTemp");
const Payment = require("../model/Payment");
const Token = require("../model/Token");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const crypto = require("crypto");
require("dotenv").config(); // To load environment variables
const qs = require("qs");

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

// ===========START -- PHONE PAY USING V1- OLD ONE NOT WORK WITH CURRENT CREDENTIALS=============================================

exports.paymentIntentPhonePay1 = async (req, res, next) => {
  try{
    const transactionid = `TXN_${Date.now()}`;
    const amount = Number(req?.body?.totalAmount);
    const totalAmount = amount * 100;
    const contact = req?.body?.contact;
  
  
    let reqBody = req.body;
    reqBody.paymentIntent = { merchantTransactionId: transactionid }
    const orderTempItems = await OrderTemp.create(req.body);
    // Payload definition
    const payload = {
      merchantTransactionId: transactionid,
      merchantId: process.env.NEXT_PUBLIC_MERCHANT_ID,
      merchantUserId: process.env.NEXT_PUBLIC_MERCHANT_USER_ID,
      redirectUrl: `${process.env.API_URL}/api/order/status/${transactionid}`,
      redirectMode: "POST",
      amount: 100,
      mobileNumber: contact,
      order: req?.body,
      paymentInstrument: {
        type: "PAY_PAGE",
      }
    };
  
    console.log("Payload:", payload);
  
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
    const UAT_PAY_API_URL = process.env.NEXT_PUBLIC_PAY_API_URL;
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
    res.send({ response: response.data })
  }catch(error){
    console.log("Error in paymentIntentPhonePay :",error);
    next(error)
  }
  

};

const sha256 = (data) => {
  return crypto.createHash("sha256").update(data).digest("hex");
};

const saveTransaction = async ({
  transactionId,
  amount,
  status,
}) => {
  await Payment.create({
    transactionId,
    amount,
    status,
  });
};

exports.paymentStatusPhonePay1 = async (req, res, next) => {
  try {
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
      url: `${process.env.NEXT_PUBLIC_STATUS_API_URL}${merchantId}/${transactionId}`,
      headers: {
        accept: "application/json",
        "Content-Type": "application/json",
        "X-VERIFY": checksum,
        "X-MERCHANT-ID": `${merchantId}`,
      },
    };

    // Check payment status
    const response = await axios.request(options);
    const responseData = response.data;
    console.log("Response data:", responseData);
    console.log("Response code:", response.data.code);

    // SET THE PAYMENT STATUS
    const paymentReq = {
      transactionId: transactionId,
      amount: Number(responseData?.data.amount) || 0,
      status: response.data.code === "PAYMENT_SUCCESS" ? "Success" : "Failed",
    }
    saveTransaction(paymentReq);

    // Check if the payment was successful

    if (response.data.code === "PAYMENT_SUCCESS") {
      const orderItemTemp = await OrderTemp.findOne({ "paymentIntent.merchantTransactionId": transactionId }).populate('user');

      if (orderItemTemp) {
        let { _id, ...orderData } = orderItemTemp._doc;
        orderData.paymentStatus = "success";

        const newOrder = await Order.create(orderData);

        // Use JavaScript-based redirection instead of server-side 301
        return res.send(`<script>window.location.href="${process.env.STORE_URL}/order/${newOrder._id}";</script>`);
      } else {
        console.log("Temp order not found for transactionId:", transactionId);
        return res.send(`<script>window.location.href="${process.env.STORE_URL}/  /failed";</script>`);
      }
    } else {
      // PAYMENT FAILED
      const orderItemTemp = await OrderTemp.findOne({ "paymentIntent.merchantTransactionId": transactionId }).populate('user');
      if (orderItemTemp) {
        let { _id, ...orderData } = orderItemTemp._doc;
        orderData.paymentStatus = "failed";

        const newOrder = await Order.create(orderData);

        // Use JavaScript-based redirection instead of server-side 301
        return res.send(`<script>window.location.href="${process.env.STORE_URL}/order/${newOrder._id}";</script>`);
      }
      return res.send(`<script>window.location.href="${process.env.STORE_URL}/order/failed";</script>`);
    }
  } catch (e) {
    console.log("Error:", e);
    return res.redirect(301, `${process.env.STORE_URL}/order/12345`);
  }

};

// ===========END -- PHONE PAY USING V1- OLD ONE NOT WORK WITH CURRENT CREDENTIALS=============================================


// ===========START -- PHONE PAY USING V2- NEW=============================================

const getAccessToken = async () => {
  const data = qs.stringify({
    client_id: process.env.NEXT_PUBLIC_CLIENT_ID,
    client_version: process.env.NEXT_PUBLIC_CLIENT_VERSION, // For UAT, use "1". For PROD, use the version provided in your credentials email.
    client_secret: process.env.NEXT_PUBLIC_CLIENT_SECRATE,
    grant_type: 'client_credentials'
  });

  console.log('getAccessToken Data:', `${process.env.NEXT_PUBLIC_API_URL}/v1/oauth/token`, data);

  try {
    const response = await axios.post(
      `${process.env.NEXT_PUBLIC_TOKEN_URL}`,
      data,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    console.log('Access Token:', response.data.access_token);
    return response.data;
  } catch (error) {
    console.error('Error fetching access token:', error);
    throw error;
  }
};


exports.paymentIntentPhonePay = async (req, res, next) => {

  // CREATE TEMP ORDER
  const transactionid = `TXN_${Date.now()}`;
  const amount = Number(req?.body?.totalAmount);
  const totalAmount = amount * 100;
  const contact = req?.body?.contact;

  let reqBody = req.body;
  reqBody.paymentIntent = { merchantTransactionId: transactionid }
  await OrderTemp.create(req.body);
  
  // GET THE ACCESS TOKEN
  const tokenData = await getAccessToken();

  // Upsert token into MongoDB. We assume there's only one token document.
  await Token.findOneAndUpdate({}, tokenData, { upsert: true, new: true });
  console.log('Token stored in Mongo:', tokenData.access_token);
  const accessToken = tokenData.access_token;

  try {
    const payload = {
      "merchantOrderId": transactionid,
      "amount": totalAmount,
      "expireAfter": 1200,
      "metaInfo": req.body,
      "paymentFlow": {
          "type": "PG_CHECKOUT",
          "message": "Payment message used for collect requests",
          "merchantUrls": {
              "redirectUrl": `${process.env.API_URL}/api/order/status/${transactionid}`,
          }
      } 
  }

  console.log("Payload:", payload);
    const response = await axios.post(
      `${process.env.NEXT_PUBLIC_API_URL}/checkout/v2/pay`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `O-Bearer ${accessToken}` // Replace with your valid access token
        }
      }
    );

    console.log("Initiate Payment Response:", response.data);
     res.send({ response: response.data });
  } catch (error) {
    console.error("Error initiating payment:", error.response?.data || error.message);
    throw error;
  }
};

const _getStoredAccessToken = async () => {
  const tokenDoc = await Token.findOne({});
  if (!tokenDoc) {
    throw new Error('Access token not available');
  }
  return tokenDoc.access_token;
};

const _checkOrderStatusApi = async (merchantOrderId) => {
  const accessToken = await _getStoredAccessToken();
  console.log("access token instatus api:",accessToken)
  console.log('Access Token:', accessToken);
  try {
    const config = {
      method: 'get',
      maxBodyLength: Infinity,
      url: `${process.env.NEXT_PUBLIC_API_URL}/checkout/v2/order/${merchantOrderId}/status`,
      headers: { 
        'Authorization': `O-Bearer ${accessToken}`
      }
    };

    console.log("Config:", config)
    
    const response = await  axios.request(config)
    console.log('Order Status:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error fetching order status:', error.response ? error.response.data : error.message);
    throw error;
  }
};

exports.paymentStatusPhonePay = async (req, res, next) => {

  try{
    console.log("paymentStatusPhonePay:",req.params.id,req.body)

    const merchantOrderId = req.params.id;
    const orderStatusData = await _checkOrderStatusApi(merchantOrderId);
    console.log('Order Status Data:', orderStatusData);
  
    if (orderStatusData.state === "COMPLETED") {
      const orderItemTemp = await OrderTemp.findOne({ "paymentIntent.merchantTransactionId": merchantOrderId }).populate('user');
  
      if (orderItemTemp) {
        let { _id, ...orderData } = orderItemTemp._doc;
        orderData.paymentStatus = "success";
  
        const newOrder = await Order.create(orderData);
  
        // Use JavaScript-based redirection instead of server-side 301
        return res.send(`<script>window.location.href="${process.env.STORE_URL}/order/${newOrder._id}";</script>`);
      } else {
        console.log("Temp order not found for transactionId:", transactionId);
        return res.send(`<script>window.location.href="${process.env.STORE_URL}/  /failed";</script>`);
      }
    } else {
      // PAYMENT FAILED
      const orderItemTemp = await OrderTemp.findOne({ "paymentIntent.merchantTransactionId": transactionId }).populate('user');
      if (orderItemTemp) {
        let { _id, ...orderData } = orderItemTemp._doc;
        orderData.paymentStatus = "failed";
  
        const newOrder = await Order.create(orderData);
  
        // Use JavaScript-based redirection instead of server-side 301
        return res.send(`<script>window.location.href="${process.env.STORE_URL}/order/${newOrder._id}";</script>`);
      }
      return res.send(`<script>window.location.href="${process.env.STORE_URL}/order/failed";</script>`);
    }
  }catch(error){
    console.log("Error in paymentStatusPhonePay :",error);
    return res.send(`<script>window.location.href="${process.env.STORE_URL}/order/failed";</script>`);
  }
  

  
};

