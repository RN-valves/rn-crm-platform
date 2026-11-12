import { Request, Response } from "express";
import { getSalesExecutiveModel, INITIAL_SALES_EXECUTIVES } from "../models/SalesExecutive.js";
import { getLeadModel } from "../models/Lead.js";
import { SalesRepDirectory } from "../services/conversation/salesRepDirectory.js";

/**
 * GET /api/sales-executives
 * List all sales executives with live lead counts
 */
export async function getSalesExecutives(_req: Request, res: Response): Promise<void> {
  try {
    const Model = getSalesExecutiveModel();
    let execs = await Model.find().sort({ orderIndex: 1, createdAt: 1 }).lean();

    if (!execs || execs.length === 0) {
      await Model.insertMany(INITIAL_SALES_EXECUTIVES);
      execs = await Model.find().sort({ orderIndex: 1, createdAt: 1 }).lean();
    }

    // Get lead stats by executive
    let leadStatsMap: Record<string, { leadsHandled: number; converted: number }> = {};
    try {
      const Lead = getLeadModel();
      const stats = await Lead.aggregate([
        { $match: { assignedEmployeeName: { $exists: true, $ne: "" } } },
        {
          $group: {
            _id: "$assignedEmployeeName",
            leadsHandled: { $sum: 1 },
            converted: {
              $sum: {
                $cond: [{ $in: ["$status", ["CONVERTED", "WON", "Orders Won / Converted"]] }, 1, 0],
              },
            },
          },
        },
      ]);

      stats.forEach((s) => {
        let name = s._id;
        // Normalize "Amit Kumar" to "Amit Kumar Sir"
        if (name === "Amit Kumar") name = "Amit Kumar Sir";

        if (!leadStatsMap[name]) {
          leadStatsMap[name] = { leadsHandled: 0, converted: 0 };
        }
        leadStatsMap[name].leadsHandled += s.leadsHandled;
        leadStatsMap[name].converted += s.converted;
      });
    } catch (statErr) {
      console.warn("[SalesExecutive] Stats aggregate warning:", statErr);
    }

    const executivesWithStats = execs.map((exec) => {
      const stat = leadStatsMap[exec.name] || { leadsHandled: 0, converted: 0 };
      return {
        ...exec,
        leadsHandled: stat.leadsHandled,
        converted: stat.converted,
      };
    });

    res.status(200).json({
      success: true,
      executives: executivesWithStats,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/sales-executives
 * Create new sales executive
 */
export async function createSalesExecutive(req: Request, res: Response): Promise<void> {
  try {
    const { name, mobile, area, state, pinPrefixes, isActive, isDefaultFallback } = req.body;

    if (!name || !mobile || !state) {
      res.status(400).json({ error: "Name, Mobile Number, and State/Territory are required." });
      return;
    }

    const Model = getSalesExecutiveModel();
    const count = await Model.countDocuments();

    const newExec = await Model.create({
      name: name.trim(),
      mobile: mobile.trim(),
      area: (area || "").trim(),
      state: state.trim(),
      pinPrefixes: Array.isArray(pinPrefixes)
        ? pinPrefixes.map((p: string) => String(p).trim()).filter(Boolean)
        : typeof pinPrefixes === "string"
        ? pinPrefixes.split(",").map((p: string) => p.trim()).filter(Boolean)
        : [],
      isActive: isActive !== undefined ? Boolean(isActive) : true,
      isDefaultFallback: Boolean(isDefaultFallback),
      orderIndex: count + 1,
    });

    // Refresh in-memory cache in SalesRepDirectory
    await SalesRepDirectory.refreshCache();

    res.status(201).json({
      success: true,
      message: "Sales executive created successfully",
      executive: newExec,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * PUT /api/sales-executives/:id
 * Update existing sales executive
 */
export async function updateSalesExecutive(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { name, mobile, area, state, pinPrefixes, isActive, isDefaultFallback, orderIndex } = req.body;

    const Model = getSalesExecutiveModel();
    const updateData: any = {};

    if (name !== undefined) updateData.name = name.trim();
    if (mobile !== undefined) updateData.mobile = mobile.trim();
    if (area !== undefined) updateData.area = area.trim();
    if (state !== undefined) updateData.state = state.trim();
    if (pinPrefixes !== undefined) {
      updateData.pinPrefixes = Array.isArray(pinPrefixes)
        ? pinPrefixes.map((p: string) => String(p).trim()).filter(Boolean)
        : typeof pinPrefixes === "string"
        ? pinPrefixes.split(",").map((p: string) => p.trim()).filter(Boolean)
        : [];
    }
    if (isActive !== undefined) updateData.isActive = Boolean(isActive);
    if (isDefaultFallback !== undefined) updateData.isDefaultFallback = Boolean(isDefaultFallback);
    if (orderIndex !== undefined) updateData.orderIndex = Number(orderIndex);

    const updated = await Model.findByIdAndUpdate(id, { $set: updateData }, { new: true });

    if (!updated) {
      res.status(404).json({ error: "Sales executive not found" });
      return;
    }

    // Refresh in-memory cache in SalesRepDirectory
    await SalesRepDirectory.refreshCache();

    res.status(200).json({
      success: true,
      message: "Sales executive updated successfully",
      executive: updated,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * DELETE /api/sales-executives/:id
 * Delete sales executive
 */
export async function deleteSalesExecutive(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const Model = getSalesExecutiveModel();
    const deleted = await Model.findByIdAndDelete(id);

    if (!deleted) {
      res.status(404).json({ error: "Sales executive not found" });
      return;
    }

    // Refresh in-memory cache in SalesRepDirectory
    await SalesRepDirectory.refreshCache();

    res.status(200).json({
      success: true,
      message: "Sales executive deleted successfully",
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
