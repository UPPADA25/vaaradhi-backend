import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import Razorpay from "razorpay";
import User from "./models/User.js"; // ✅ User model

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// ========================
// 🧩 MongoDB Connection
// ========================
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Error:", err));

// ========================
// 💳 Razorpay Setup
// ========================
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ========================
// 🧾 SCHEMAS
// ========================
const walletSchema = new mongoose.Schema({
  userId: String,
  points: { type: Number, default: 0 },
  rupees: { type: Number, default: 0 },
  date: { type: Date, default: Date.now },
});
const Wallet = mongoose.model("Wallet", walletSchema);

const formSchema = new mongoose.Schema({
  name: String,
  mobile: String,
  email: String,
  pan: String,
  aadhaar: String,
  formType: String,
  date: { type: Date, default: Date.now },
});
const Form = mongoose.model("Form", formSchema);

// ========================
// 🚀 ROUTES
// ========================

// Root Route
app.get("/", (req, res) => res.send("✅ Vaaradhi Print Portal API Running"));

// ------------------------
// 👤 AUTH ROUTES
// ------------------------
app.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res
        .status(400)
        .json({ success: false, message: "Email and password required" });

    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res
        .status(400)
        .json({ success: false, message: "Email already registered" });

    const hashed = await bcrypt.hash(password, 10);
    const user = new User({ email, password: hashed });
    await user.save();

    // 🪙 Create empty wallet for new user
    await new Wallet({ userId: user._id, points: 0, rupees: 0 }).save();

    res.json({ success: true, message: "User registered successfully" });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user)
      return res
        .status(400)
        .json({ success: false, message: "Invalid email or password" });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid)
      return res
        .status(400)
        .json({ success: false, message: "Invalid email or password" });

    res.json({
      success: true,
      message: "Login successful",
      userId: user._id,
      email: user.email,
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------
// 💳 PAYMENT ROUTES (Razorpay)
// ------------------------

// ✅ Create Razorpay Order
app.post("/api/payment/order", async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount)
      return res
        .status(400)
        .json({ success: false, message: "Amount is required" });

    const options = {
      amount: amount * 100, // convert to paisa
      currency: "INR",
      receipt: "rcpt_" + Date.now(),
    };

    const order = await razorpay.orders.create(options);
    res.json({ success: true, order });
  } catch (err) {
    console.error("Razorpay Order Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ✅ Verify Payment Signature
app.post("/api/payment/verify", async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;

    const sign = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (sign !== razorpay_signature) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid signature" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Payment Verification Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------
// 💰 WALLET ROUTES
// ------------------------

// Add Wallet Points
app.post("/api/wallet/add", async (req, res) => {
  try {
    const { userId, points, rupees } = req.body;

    if (!userId || !points || !rupees)
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });

    const wallet = new Wallet({ userId, points, rupees });
    await wallet.save();

    res.json({ success: true, message: "Wallet updated successfully", wallet });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get Wallet Balance
app.get("/api/wallet/balance/:userId", async (req, res) => {
  try {
    const walletData = await Wallet.find({ userId: req.params.userId }).sort({
      date: -1,
    });
    const totalPoints = walletData.reduce((sum, w) => sum + w.points, 0);
    const totalRupees = walletData.reduce((sum, w) => sum + w.rupees, 0);
    res.json({ success: true, totalPoints, totalRupees });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ------------------------
// 📋 FORM ROUTES
// ------------------------
app.post("/api/form/submit", async (req, res) => {
  try {
    const { name, mobile, email, pan, aadhaar, formType } = req.body;
    if (!name || !mobile || !email || !pan || !aadhaar)
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });

    const form = new Form({ name, mobile, email, pan, aadhaar, formType });
    await form.save();

    res.json({
      success: true,
      message: `${formType} form submitted successfully`,
      form,
    });
  } catch (err) {
    console.error("Form submission error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ========================
// 🚀 START SERVER
// ========================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
