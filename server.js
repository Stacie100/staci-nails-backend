import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mpesaRoutes from "./routes/mpesa.js";

dotenv.config();

const app = express();

app.use(cors({
  origin: ["http://localhost:5173", "https://tomblike-autoeciously-dacia.ngrok-free.dev"],
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization", "ngrok-skip-browser-warning"],
}));

app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "Staci Nails backend running!" });
});

app.use("/api/mpesa", mpesaRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});