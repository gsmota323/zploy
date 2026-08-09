import express from "express";
import path from "path";
const cors = require("cors");
import userRoutes from "./routes/userRoutes";
import authRoutes from "./routes/authRoutes"; 
import appRoutes from "./routes/appRoutes";
import './workers/deployWorker';
import deployRoutes from "./routes/deployRoutes";
import kubernetesRoutes from "./routes/kubernetesRoutes";

const app = express();

app.use(cors());
app.use(express.json());

// Serve o frontend estático
app.use("/frontend", express.static(path.join(process.cwd(), "frontend")));

app.use("/users", userRoutes);
app.use("/auth", authRoutes); 
app.use("/apps", appRoutes);

app.get("/", (req, res) => {
  res.sendFile(path.join(process.cwd(), "frontend", "index.html"));
});

app.use("/deploys", deployRoutes);
app.use("/kubernetes", kubernetesRoutes);

export default app;