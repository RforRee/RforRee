import cors from "cors";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import helmet from "helmet";
import morgan from "morgan";
import { isAppError } from "./errors.js";
import { apiKeysRouter } from "./routes/apiKeys.js";
import { binsRouter } from "./routes/bins.js";
import { clientsRouter } from "./routes/clients.js";
import { externalRouter } from "./routes/external.js";
import { inboundOrdersRouter } from "./routes/inboundOrders.js";
import { inventoryRouter } from "./routes/inventory.js";
import { outboundOrdersRouter } from "./routes/outboundOrders.js";
import { skusRouter } from "./routes/skus.js";
import { syncRouter } from "./routes/sync.js";
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
  app.use("/api/inventory", inventoryRouter);
  app.use("/api/inbound-orders", inboundOrdersRouter);
  app.use("/api/outbound-orders", outboundOrdersRouter);
  app.use("/api/api-keys", apiKeysRouter);
  app.use("/api/sync", syncRouter);
  app.use("/api/v1/external", externalRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: "Route not found" });
  });

  app.use(
    (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
      if (isAppError(err)) {
        res.status(err.statusCode).json({
          error: err.message,
          code: err.code,
        });
        return;
      }
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    },
  );

  return app;
}
