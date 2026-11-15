import cors from "cors";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import helmet from "helmet";
import morgan from "morgan";
import { binsRouter } from "./routes/bins.js";
import { clientsRouter } from "./routes/clients.js";
import { skusRouter } from "./routes/skus.js";
import { warehousesRouter } from "./routes/warehouses.js";
import { zonesRouter } from "./routes/zones.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/clients", clientsRouter);
  app.use("/api/warehouses", warehousesRouter);
  app.use("/api/zones", zonesRouter);
  app.use("/api/bins", binsRouter);
  app.use("/api/skus", skusRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: "Route not found" });
  });

  app.use(
    (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    },
  );

  return app;
}
