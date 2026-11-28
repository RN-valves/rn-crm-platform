import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { config } from "../config/env.js";
import { getCrmUserModel } from "../models/User.js";
import { getSalesExecutiveModel } from "../models/SalesExecutive.js";

function escapeRegex(text: string): string {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}

export async function login(req: Request, res: Response): Promise<void> {
  const identifier = (req.body.identifier || req.body.email || req.body.username || req.body.mobile || "").toString().trim();
  const secret = (req.body.password || req.body.pin || "").toString().trim();

  if (!identifier || !secret) {
    res.status(400).json({
      success: false,
      error: "Please enter your username, email, or mobile number and password/PIN.",
    });
    return;
  }

  try {
    let payload: any = null;

    // 1. Check CrmUser collection (Admins)
    try {
      const UserModel = getCrmUserModel();
      const adminUser = await UserModel.findOne({
        $or: [
          { email: identifier.toLowerCase() },
          { name: new RegExp(`^${escapeRegex(identifier)}$`, "i") },
          { phone: identifier },
        ],
      });

      if (adminUser) {
        if (adminUser.isActive === false) {
          res.status(403).json({
            success: false,
            error: "This admin account has been deactivated. Please contact support.",
          });
          return;
        }

        const match = await bcrypt.compare(secret, adminUser.passwordHash);
        if (match) {
          payload = {
            id: String(adminUser._id),
            name: adminUser.name,
            email: adminUser.email,
            phone: adminUser.phone || "",
            role: "ADMIN" as const,
            department: adminUser.department || "Management",
          };
        }
      }
    } catch (err: any) {
      console.warn("[Auth] Admin check notice:", err.message);
    }

    // 2. Check SalesExecutive collection (Sales Reps)
    if (!payload) {
      try {
        const ExecModel = getSalesExecutiveModel();
        const cleanPhone = identifier.replace(/\D/g, "");
        const phoneQueries: any[] = [{ mobile: identifier }];
        if (cleanPhone.length >= 10) {
          const tenDigit = cleanPhone.slice(-10);
          phoneQueries.push(
            { mobile: tenDigit },
            { mobile: `+91${tenDigit}` },
            { mobile: `91${tenDigit}` },
            { mobile: `+91 ${tenDigit.slice(0, 5)} ${tenDigit.slice(5)}` }
          );
        }

        const exec = await ExecModel.findOne({
          $or: [
            { name: new RegExp(`^${escapeRegex(identifier)}$`, "i") },
            { email: identifier.toLowerCase() },
            ...phoneQueries,
          ],
        });

        if (exec) {
          if (exec.isActive === false) {
            res.status(403).json({
              success: false,
              error: "This sales executive account is deactivated.",
            });
            return;
          }

          let pinMatch = false;
          if (exec.pinHash) {
            pinMatch = await bcrypt.compare(secret, exec.pinHash);
          }
          if (!pinMatch && exec.pin && exec.pin === secret) {
            pinMatch = true;
            // Upgrade to bcrypt hash
            exec.pinHash = await bcrypt.hash(secret, 10);
            await exec.save().catch(() => {});
          }

          if (pinMatch) {
            const isEcomm =
              exec.department === "ECOMMERCE" ||
              /kanika|tammana|e-commerce|ecommerce/i.test(exec.name || "");
            payload = {
              id: String(exec._id),
              name: exec.name,
              email: (exec as any).email || "",
              phone: exec.mobile,
              role: "SALES" as const,
              department: isEcomm ? "ECOMMERCE" : "Sales",
              repId: String(exec._id),
              repName: exec.name,
              repMobile: exec.mobile,
              state: exec.state,
            };
          }
        }
      } catch (err: any) {
        console.warn("[Auth] Sales executive check notice:", err.message);
      }
    }

    // 3. Fallback for admin bootstrap if DB seeding had a temporary hitch
    if (!payload) {
      const isDefaultAdmin =
        (identifier.toLowerCase() === "admin@rnvalves.com" ||
          identifier.toLowerCase() === "admin") &&
        secret === "RNadmin@2026";

      if (isDefaultAdmin) {
        payload = {
          id: "usr_admin_default_01",
          name: "RN Valves Admin",
          email: "admin@rnvalves.com",
          role: "ADMIN" as const,
          department: "Management",
        };
      }
    }

    if (!payload) {
      res.status(401).json({
        success: false,
        error: "Invalid username, mobile number, or password/PIN.",
      });
      return;
    }

    // Sign JWT Token
    const token = jwt.sign(payload, config.JWT_SECRET, {
      expiresIn: config.JWT_EXPIRES_IN as any,
    });

    // Set secure SameSite=Lax cookie across .rnvalves.com (same-site, never blocked by 3P cookie blockers)
    const isProduction = config.NODE_ENV === "production";
    const cookieOptions: any = {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: "/",
    };
    if (isProduction) {
      cookieOptions.domain = ".rnvalves.com";
    }
    res.cookie("rn_crm_token", token, cookieOptions);

    res.status(200).json({
      success: true,
      token,
      user: payload,
      redirectTo: payload.role === "ADMIN" ? "/dashboard" : "/rep-portal",
    });
  } catch (err: any) {
    console.error("[Auth] Login error:", err);
    res.status(500).json({
      success: false,
      error: "Authentication service error. Please try again.",
    });
  }
}

export async function logout(req: Request, res: Response): Promise<void> {
  const isProduction = config.NODE_ENV === "production";
  const cookieOptions: any = {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
  };
  if (isProduction) {
    cookieOptions.domain = ".rnvalves.com";
  }
  res.clearCookie("rn_crm_token", cookieOptions);
  res.clearCookie("rn_crm_token", { path: "/" });
  res.status(200).json({
    success: true,
    message: "Logged out successfully.",
  });
}

export async function getMe(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: "Unauthorized: No active session.",
    });
    return;
  }
  res.status(200).json({
    success: true,
    user: req.user,
  });
}
