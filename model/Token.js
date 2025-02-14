const mongoose = require("mongoose");

const TokenSchema = new mongoose.Schema({
  access_token: { type: String, required: true },
  encrypted_access_token: String,
  expires_at: { type: Number, required: true }, // epoch seconds
  issued_at: { type: Number, required: true },
  token_type: { type: String, required: true },
});

const Token = mongoose.model("Token", TokenSchema);
module.exports = Token;
