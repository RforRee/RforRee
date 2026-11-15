import type { NextFunction, Request, Response } from "express";
import { ZodError, type ZodTypeAny } from "zod";
import { Prisma } from "@prisma/client";

type RequestPart = "body" | "query" | "params";

export type ValidatedRequest = Request & {
  validated?: Partial<Record<RequestPart, unknown>>;
};

export function validate(schema: ZodTypeAny, part: RequestPart = "body") {
  return (req: Request, res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req[part]);
    if (!parsed.success) {
      res.status(400).json({
        error: "Validation failed",
        details: formatZodError(parsed.error),
      });
      return;
    }

    const vreq = req as ValidatedRequest;
    vreq.validated = { ...vreq.validated, [part]: parsed.data };

    // Express 5: req.query is a getter-only property — never assign it.
    if (part === "body") {
      req.body = parsed.data;
    } else if (part === "params") {
      req.params = parsed.data as Request["params"];
    }
    next();
  };
}

export function formatZodError(error: ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

export function handlePrismaError(error: unknown, res: Response): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      const target = Array.isArray(error.meta?.target)
        ? (error.meta?.target as string[]).join(", ")
        : "unique field";
      res.status(409).json({
        error: "Conflict",
        message: `A record with this ${target} already exists`,
      });
      return true;
    }
    if (error.code === "P2003") {
      res.status(400).json({
        error: "Invalid reference",
        message: "Referenced parent record does not exist",
      });
      return true;
    }
    if (error.code === "P2025") {
      res.status(404).json({ error: "Not found" });
      return true;
    }
  }
  return false;
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    void fn(req, res, next).catch(next);
  };
}
