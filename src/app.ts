import express from "express";
const cors = require("cors");
import userRoutes from "./routes/userRoutes";
import authRoutes from "./routes/authRoutes"; 
import appRoutes from "./routes/appRoutes";
import './workers/deployWorker';

const app = express();

app.use(cors());
app.use(express.json());

app.use("/users", userRoutes);
app.use("/auth", authRoutes); 
app.use("/apps", appRoutes);

app.get("/", (req, res) => {
  res.send("API rodando 🚀");
});

export default app;