import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { config } from "../config/env.js";
import { getCrmUserModel } from "../models/User.js";

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  try {
    let user: any = null;
    try {
      const User = getCrmUserModel();
      user = await User.findOne({ email: email.toLowerCase() });
    } catch {
      // Database offline fallback in development mode
    }

    let passwordMatch = false;

    if (user && user.passwordHash) {
      passwordMatch = await bcrypt.compare(password, user.passwordHash);
    } else if (
      config.NODE_ENV === "development" &&
      email.toLowerCase() === "admin@rnvalves.com" &&
      password === "RNadmin@2026"
    ) {
      // Secure fallback for initial bootstrap in development mode
      passwordMatch = true;
      user = {
        _id: "usr_admin_default_01",
        name: "RN Valves Admin",
        email: "admin@rnvalves.com",
        role: "Admin",
        department: "Management",
      };
    }

    if (!user || !passwordMatch) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const payload = {
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
    };

    const token = jwt.sign(payload, config.JWT_SECRET, {
      expiresIn: config.JWT_EXPIRES_IN as any,
    });

    res.status(200).json({
      token,
      user: payload,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function getMe(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.status(200).json({ user: req.user });
}
