import cors from "cors";
import express from "express";
import helmet from "helmet";
import { loadConfig } from "./config.js";
import { createAuthMiddleware } from "./auth.js";
import { createApiRouter } from "./routes.js";

const config = loadConfig();
const app = express();
const isNonDevEnvironment = (process.env.NODE_ENV ?? "development").toLowerCase() !== "development";

app.use(helmet());
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: "50mb" }));

if (isNonDevEnvironment) {
  app.set("trust proxy", 1);
  app.use((req, res, next) => {
    if (req.path === "/api/health") {
      next();
      return;
    }
    const forwardedProto = req.headers["x-forwarded-proto"];
    const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
    if (req.secure || proto === "https") {
      next();
      return;
    }
    res.status(426).json({ error: "HTTPS is required outside development environments" });
  });
}

app.use("/api", createAuthMiddleware(config), createApiRouter(config));

app.listen(config.port, () => {
  console.log(`BFF auth mode: ${config.authMode.toUpperCase()}`);
  console.log(`BFF listening on http://localhost:${config.port}`);
});
