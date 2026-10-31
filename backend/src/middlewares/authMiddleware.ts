import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config/env.js";

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: "Admin" | "Manager" | "Sales_Agent" | "Support_Agent";
  department: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    // In development/test mode allow fallback demo-admin token if header is missing
    if (config.NODE_ENV === "development") {
      req.user = {
        id: "usr_dev_admin_001",
        name: "Admin Executive",
        email: "admin@rnvalves.com",
        role: "Admin",
        department: "Management",
      };
      return next();
    }
    res.status(401).json({ error: "Unauthorized: Missing authentication token" });
    return;
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET) as AuthenticatedUser;
    req.user = decoded;
    next();
  } catch (err: any) {
    res.status(401).json({ error: "Unauthorized: Invalid or expired token" });
  }
}

export function requireRole(allowedRoles: Array<"Admin" | "Manager" | "Sales_Agent" | "Support_Agent">) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: "Forbidden: Insufficient privileges" });
      return;
    }

    next();
  };
}
