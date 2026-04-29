import express from "express";
import cors from "cors";
import userRoutes from "./routes/userRoutes";
import authRoutes from "./routes/authRoutes"; // 👈 1. Importe as rotas de auth

const app = express();

app.use(cors());
app.use(express.json());

// 2. Registre as rotas no Express
app.use("/users", userRoutes);
app.use("/auth", authRoutes); // 👈 3. Conecte o caminho base "/auth"

app.get("/", (req, res) => {
  res.send("API rodando 🚀");
});

export default app;