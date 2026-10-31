"use client";

import { useState, useEffect } from "react";
import Header from "../../components/Header";
import { crmApi } from "../../lib/api";
import { Search, Building, Phone, MapPin, Tag, CheckCircle2, User } from "lucide-react";

export default function ContactsDirectory() {
  const [contacts, setContacts] = useState([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);

  const fetchContacts = async () => {
    setLoading(true);
    try {
      const query = typeFilter !== "ALL" ? `?businessType=${typeFilter}` : "";
      const res = await crmApi.getContacts(query);
      setContacts(res.contacts || []);
    } catch (err) {
      console.error("Failed to fetch contacts:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContacts();
  }, [typeFilter]);

  const filteredContacts = contacts.filter((c) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      c.name?.toLowerCase().includes(s) ||
      c.phone?.toLowerCase().includes(s) ||
      c.businessName?.toLowerCase().includes(s) ||
      c.city?.toLowerCase().includes(s)
    );
  });

  return (
    <div className="flex-1 flex flex-col h-screen overflow-y-auto">
      <Header
        title="Contacts Directory"
        subtitle="Customer database, wholesale classifications & WhatsApp profiles"
        onRefresh={fetchContacts}
      />

      <main className="p-8 space-y-6 max-w-7xl mx-auto w-full">
        {/* Search & Business Filters */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by customer name, phone, business, or city..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-100 rounded-lg border border-transparent focus:bg-white focus:border-rn-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap text-xs">
            {["ALL", "Dealer", "Distributor", "Retailer", "OEM", "Plumber", "Other"].map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                  typeFilter === t
                    ? "bg-rn-600 text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Contacts Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-6 py-4">Customer / Firm</th>
                  <th className="px-6 py-4">Phone Number</th>
                  <th className="px-6 py-4">Business Type</th>
                  <th className="px-6 py-4">Location</th>
                  <th className="px-6 py-4">Inquiries</th>
                  <th className="px-6 py-4">Tags</th>
                  <th className="px-6 py-4">Verified</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredContacts.map((c) => (
                  <tr key={c._id || c.phone} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900">{c.name}</div>
                      {c.businessName && (
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <Building className="w-3 h-3 text-slate-400" />
                          {c.businessName}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 font-mono text-slate-700">{c.phone}</td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-0.5 rounded-md font-semibold text-[10px] bg-slate-100 text-slate-700 border border-slate-200">
                        {c.businessType || "Other"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {c.city ? `${c.city}${c.state ? `, ${c.state}` : ""}` : "India"}
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-900">{c.totalEnquiriesCount || 1}</td>
                    <td className="px-6 py-4">
                      <div className="flex gap-1 flex-wrap">
                        {(c.tags || []).map((t, i) => (
                          <span key={i} className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[9px] font-medium">
                            {t}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {c.isVerifiedDealer ? (
                        <span className="text-emerald-600 flex items-center gap-1 font-semibold text-[11px]">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Verified
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[11px]">Standard</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
