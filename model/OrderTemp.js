const mongoose = require("mongoose");

const orderTempSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    cart: [{}],
    name: {
      type: String,
      required: true,
    },
    address: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
    },
    contact: {
      type: String,
      required: true,
    },

    city: {
      type: String,
      required: true,
    },
    country: {
      type: String,
      required: true,
    },
    zipCode: {
      type: String,
      required: true,
    },
    subTotal: {
      type: Number,
      required: true,
    },
    shippingCost: {
      type: Number,
      required: true,
    },
    discount: {
      type: Number,
      required: true,
      default: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
    },
    shippingOption: {
      type: String,
      required: false,
    },
    cardInfo: {
      type: Object,
      required: false,
    },
    paymentIntent: {
      type: Object,
      required: false,
    },
    paymentMethod: {
      type: String,
      required: true,
    },
    orderNote: {
      type: String,
      required: false,
    },
    invoice: {
      type: Number,
      unique: true,
    },
    status: {
      type: String,
      enum: ["pending", "processing", "delivered",'cancel'],
      lowercase: true,
    },
    paymentStatus: {
      type: String,
      enum: ["failed", "success"],
      lowercase: true,
    },
  },
  {
    timestamps: true,
  }
);

// define pre-save middleware to generate the invoice number
orderTempSchema.pre('save', async function (next) {
  const OrderTemp = this;
  if (!OrderTemp.invoice) { // check if the OrderTemp already has an invoice number
    try {
      // find the highest invoice number in the orders collection
      const highestInvoice = await mongoose
        .model('OrderTemp')
        .find({})
        .sort({ invoice: 'desc' })
        .limit(1)
        .select({ invoice: 1 });
      // if there are no orders in the collection, start at 1000
      const startingInvoice = highestInvoice.length === 0 ? 1000 : highestInvoice[0].invoice + 1;
      // set the invoice number for the new OrderTemp
      OrderTemp.invoice = startingInvoice;
      next();
    } catch (error) {
      next(error);
    }
  } else {
    next();
  }
});

const OrderTemp = mongoose.models.OrderTemp || mongoose.model("OrderTemp", orderTempSchema);
module.exports = OrderTemp;
