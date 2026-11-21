"use client";

import { useState, useEffect, useMemo } from "react";
import Header from "../../components/Header";
import Pagination from "../../components/ui/Pagination";
import { crmApi } from "../../lib/api";
import { Card, CardContent } from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import Input from "../../components/ui/Input";
import {
  Search,
  Building,
  Phone,
  CheckCircle2,
  Users,
  ShieldCheck,
  MessageSquare,
  FileSpreadsheet,
} from "lucide-react";
import Link from "next/link";

export default function ContactsDirectory() {
  const [contacts, setContacts] = useState([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const fetchContacts = async (force = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "1000" });
      if (typeFilter !== "ALL") params.set("businessType", typeFilter);
      const res = await crmApi.getContacts(`?${params.toString()}`, force);
      setContacts(res.contacts || []);
    } catch (err) {
      console.error("Failed to fetch contacts:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContacts(false);
  }, [typeFilter]);

  useEffect(() => {
    setPage(1);
  }, [search, typeFilter]);

  const toggleVerifyDealer = async (contact) => {
    const nextVal = !contact.isVerifiedDealer;
    setContacts((prev) =>
      prev.map((c) => (c._id === contact._id ? { ...c, isVerifiedDealer: nextVal } : c))
    );
    try {
      await crmApi.updateContact(contact._id, { isVerifiedDealer: nextVal });
    } catch (err) {
      setContacts((prev) =>
        prev.map((c) => (c._id === contact._id ? { ...c, isVerifiedDealer: !nextVal } : c))
      );
    }
  };

  const filteredContacts = useMemo(() => {
    if (!search.trim()) return contacts;
    const s = search.toLowerCase();
    return contacts.filter(
      (c) =>
        c.name?.toLowerCase().includes(s) ||
        c.phone?.toLowerCase().includes(s) ||
        c.businessName?.toLowerCase().includes(s) ||
        c.city?.toLowerCase().includes(s) ||
        c.state?.toLowerCase().includes(s)
    );
  }, [contacts, search]);

  const verifiedDealersCount = contacts.filter((c) => c.isVerifiedDealer).length;

  const exportContactsExcel = () => {
    if (!filteredContacts.length) {
      alert("No contacts to export.");
      return;
    }
    const headers = [
      "Name",
      "Phone",
      "Business / Firm",
      "Business Type",
      "City",
      "State",
      "Total Inquiries",
      "Verified Dealer",
      "Last Contacted",
    ];
    const rows = filteredContacts.map((c) => [
      c.name || "",
      c.phone || "",
      c.businessName || "",
      c.businessType || "Other",
      c.city || "",
      c.state || "",
      c.totalEnquiriesCount || 1,
      c.isVerifiedDealer ? "Yes" : "No",
      c.lastContactedAt ? new Date(c.lastContactedAt).toLocaleString("en-IN") : "",
    ]);
    const csv =
      "\uFEFF" +
      [headers, ...rows]
        .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
        .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `RN_Valves_Contacts_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-y-auto bg-[#F8FAFC] dark:bg-slate-950 transition-colors">
      <Header
        title="Contacts Directory"
        subtitle="Complete WhatsApp customer & dealer directory with verification and Excel export"
        onRefresh={() => fetchContacts(true)}
        loading={loading}
        actions={
          <button
            type="button"
            onClick={exportContactsExcel}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export Excel ({filteredContacts.length})</span>
          </button>
        }
      />

      <main className="p-4 sm:p-6 lg:p-7 space-y-5 max-w-7xl mx-auto w-full">
        {/* Minimalist KPI Counters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Total Contacts
                </p>
                <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                  {contacts.length}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">All WhatsApp profiles</p>
              </div>
              <div className="p-3 bg-[#EEF6FF] dark:bg-blue-950/60 text-[#1091d0] rounded-2xl">
                <Users className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Verified Wholesale Dealers
                </p>
                <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                  {verifiedDealersCount}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">Click status badge to toggle</p>
              </div>
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 rounded-2xl">
                <ShieldCheck className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Matching Filter
                </p>
                <p className="text-2xl font-black text-[#1091d0] dark:text-rn-400 mt-1">
                  {filteredContacts.length}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Tier: {typeFilter === "ALL" ? "All Categories" : typeFilter}
                </p>
              </div>
              <div className="p-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-2xl">
                <Building className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search & Business Tier Pills */}
        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200/85 dark:border-slate-800 shadow-sm flex flex-wrap items-center justify-between gap-3">
          <div className="flex-1 min-w-[250px] max-w-md">
            <Input
              type="text"
              placeholder="Search name, phone, firm, or city..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              icon={Search}
            />
          </div>

          <div className="flex items-center gap-1 flex-wrap text-xs bg-slate-100/90 dark:bg-slate-800 p-1 rounded-xl">
            {["ALL", "Dealer", "Distributor", "Retailer", "OEM", "Plumber", "Other"].map(
              (t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                    typeFilter === t
                      ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  {t}
                </button>
              )
            )}
          </div>
        </div>

        {/* Clean White Minimalist Contacts Table */}
        <Card>
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0 text-xs">
              <thead>
                <tr>
                  <th className="px-5 py-3">Customer / Firm</th>
                  <th className="px-4 py-3">Phone Number</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3 text-center">Inquiries</th>
                  <th className="px-4 py-3">Dealer Status</th>
                  <th className="px-5 py-3 text-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && contacts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      Loading contacts...
                    </td>
                  </tr>
                ) : filteredContacts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      No contacts found matching your criteria.
                    </td>
                  </tr>
                ) : (
                  filteredContacts
                    .slice((page - 1) * pageSize, page * pageSize)
                    .map((c) => (
                      <tr key={c._id || c.phone}>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-[#EEF6FF] dark:bg-rn-950/60 text-[#0c7db5] dark:text-rn-300 font-bold text-xs flex items-center justify-center shrink-0">
                              {c.name ? c.name.charAt(0).toUpperCase() : "C"}
                            </div>
                            <div>
                              <div className="font-semibold text-slate-900 dark:text-white text-[13px]">
                                {c.name || "WhatsApp Visitor"}
                              </div>
                              {c.businessName && (
                                <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                                  <Building className="w-3 h-3 text-slate-400 shrink-0" />
                                  {c.businessName}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 font-mono">
                          <a
                            href={`https://wa.me/${c.phone?.replace(/[^0-9]/g, "")}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1 font-medium"
                          >
                            <Phone className="w-3 h-3 shrink-0" />
                            {c.phone}
                          </a>
                        </td>
                        <td className="px-4 py-3.5">
                          <Badge variant="neutral" size="xs">
                            {c.businessType || "Dealer"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300">
                          {c.city ? `${c.city}${c.state ? `, ${c.state}` : ""}` : "India"}
                        </td>
                        <td className="px-4 py-3.5 text-center font-bold text-slate-800 dark:text-white">
                          {c.totalEnquiriesCount || 1}
                        </td>
                        <td className="px-4 py-3.5">
                          <button
                            type="button"
                            onClick={() => c._id && toggleVerifyDealer(c)}
                            title="Click to toggle verified wholesale dealer status"
                            className="inline-flex items-center"
                          >
                            {c.isVerifiedDealer ? (
                              <Badge variant="success" size="xs" icon={CheckCircle2}>
                                Verified Dealer
                              </Badge>
                            ) : (
                              <span className="px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 hover:text-emerald-700 text-slate-500 text-[11px] font-medium transition-colors">
                                Mark Verified
                              </span>
                            )}
                          </button>
                        </td>
                        <td className="px-5 py-3.5 text-end">
                          <Link
                            href={`/inbox?phone=${encodeURIComponent(c.phone || "")}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#EEF6FF] dark:bg-slate-800 hover:bg-[#DCEBFF] text-[#0c7db5] dark:text-slate-200 font-semibold rounded-lg text-[11px] transition-colors"
                          >
                            <MessageSquare className="w-3 h-3" />
                            <span>Open Chat</span>
                          </Link>
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>

          <Pagination
            totalItems={filteredContacts.length}
            currentPage={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(sz) => {
              setPageSize(sz);
              setPage(1);
            }}
            itemName="contacts"
          />
        </Card>
      </main>
    </div>
  );
}
