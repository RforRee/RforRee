import { Router } from "express";
import { isAppError } from "../errors.js";
import { asyncHandler, validate } from "../lib/validate.js";
import {
  requireApiKey,
  type AuthedRequest,
} from "../middleware/apiKeyAuth.js";
import { syncPullSchema, syncPushSchema } from "../schemas/sync.js";
import { syncPull, syncPush } from "../services/sync.js";

export const syncRouter = Router();

syncRouter.post(
  "/pull",
  requireApiKey("sync:pull"),
  validate(syncPullSchema),
  asyncHandler(async (req, res) => {
    const apiKey = (req as AuthedRequest).apiKey!;
    if (req.body.clientId !== apiKey.clientId) {
      res.status(403).json({
        error: "clientId must match the API key's client",
      });
      return;
    }
    try {
      const payload = await syncPull(req.body);
      res.json(payload);
    } catch (error) {
      if (isAppError(error)) {
        res.status(error.statusCode).json({
          error: error.message,
          code: error.code,
        });
        return;
      }
      throw error;
    }
  }),
);

syncRouter.post(
  "/push",
  requireApiKey("sync:push"),
  validate(syncPushSchema),
  asyncHandler(async (req, res) => {
    const apiKey = (req as AuthedRequest).apiKey!;
    if (req.body.clientId !== apiKey.clientId) {
      res.status(403).json({
        error: "clientId must match the API key's client",
      });
      return;
    }
    try {
      const result = await syncPush(req.body);
      const httpStatus =
        result.summary.conflicts > 0 || result.summary.rejected > 0
          ? 207
          : 200;
      res.status(httpStatus).json(result);
    } catch (error) {
      if (isAppError(error)) {
        res.status(error.statusCode).json({
          error: error.message,
          code: error.code,
        });
        return;
      }
      throw error;
    }
  }),
);
