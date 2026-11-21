import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config/env.js";

export interface AuthenticatedUser {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  role: "ADMIN" | "SALES";
  department?: string;
  repId?: string;
  repName?: string;
  repMobile?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Extract JWT from Authorization header ("Bearer <token>") or HttpOnly cookie ("rn_crm_token")
 */
function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const parts = authHeader.split(" ");
    if (parts[1] && parts[1] !== "null" && parts[1] !== "undefined") {
      return parts[1];
    }
  }

  if (req.cookies && req.cookies.rn_crm_token) {
    const cookieToken = req.cookies.rn_crm_token;
    if (cookieToken && cookieToken !== "null" && cookieToken !== "undefined") {
      return cookieToken;
    }
  }

  return null;
}

/**
 * Enforce strict authentication. No bypasses for origin, localhost, or env.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractToken(req);

  if (!token) {
    res.status(401).json({
      success: false,
      error: "Unauthorized: Missing or invalid authentication token",
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET) as any;
    
    // Normalize legacy roles if present
    let normalizedRole: "ADMIN" | "SALES" = "SALES";
    if (decoded.role === "ADMIN" || decoded.role === "Admin" || decoded.role === "Manager") {
      normalizedRole = "ADMIN";
    } else {
      normalizedRole = "SALES";
    }

    req.user = {
      id: decoded.id || decoded._id,
      name: decoded.name || "",
      email: decoded.email || "",
      phone: decoded.phone || "",
      role: normalizedRole,
      department: decoded.department || (normalizedRole === "ADMIN" ? "Management" : "Sales"),
      repId: decoded.repId || decoded.id,
      repName: decoded.repName || decoded.name,
      repMobile: decoded.repMobile || decoded.phone,
    };

    next();
  } catch (err: any) {
    res.status(401).json({
      success: false,
      error: "Unauthorized: Invalid or expired session token",
    });
  }
}

/**
 * Enforce role-based access control (ADMIN vs SALES)
 */
export function requireRole(allowedRoles: Array<"ADMIN" | "SALES">) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: "Unauthorized: Authentication required",
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: "Forbidden: You do not have permission to access this resource",
      });
      return;
    }

    next();
  };
}
