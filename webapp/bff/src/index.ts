import cors from "cors";
import express from "express";
import helmet from "helmet";
import { loadConfig } from "./config.js";
import { createAuthMiddleware } from "./auth.js";
import { createApiRouter } from "./routes.js";

const config = loadConfig();
const app = express();

app.use(helmet());
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: "50mb" }));

app.use("/api", createAuthMiddleware(config), createApiRouter(config));

app.listen(config.port, () => {
  console.log(`BFF listening on http://localhost:${config.port}`);
});
