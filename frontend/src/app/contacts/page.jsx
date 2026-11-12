"use client";

import { useState, useEffect } from "react";
import Header from "../../components/Header";
import { crmApi } from "../../lib/api";
import { Card, CardContent } from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import Input from "../../components/ui/Input";
import {
  Search,
  Building,
  Phone,
  MapPin,
  CheckCircle2,
  Users,
  ShieldCheck,
  ExternalLink,
  MessageSquare,
} from "lucide-react";
import Link from "next/link";

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

  const verifiedDealersCount = contacts.filter((c) => c.isVerifiedDealer).length;

  return (
    <div className="flex-1 flex flex-col h-screen overflow-y-auto bg-slate-50 dark:bg-slate-950 transition-colors">
      <Header
        title="Contacts Directory"
        subtitle="Customer database, wholesale dealer classifications & WhatsApp profiles"
        onRefresh={fetchContacts}
        loading={loading}
      />

      <main className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto w-full">
        {/* Contact Counters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Total Contacts
                </p>
                <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                  {contacts.length}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">In CRM database</p>
              </div>
              <div className="p-3 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-2xl">
                <Users className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Verified Wholesale Dealers
                </p>
                <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                  {verifiedDealersCount}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">Approved business entities</p>
              </div>
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-2xl">
                <ShieldCheck className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Active Filter
                </p>
                <p className="text-2xl font-black text-rn-600 dark:text-rn-400 mt-1">
                  {typeFilter === "ALL" ? "All Tiers" : typeFilter}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Showing {filteredContacts.length} contacts
                </p>
              </div>
              <div className="p-3 bg-rn-50 dark:bg-rn-950/60 text-rn-600 dark:text-rn-400 rounded-2xl">
                <Building className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search & Business Filters */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm flex flex-wrap items-center justify-between gap-4">
          <div className="relative flex-1 min-w-[260px] max-w-md">
            <Input
              type="text"
              placeholder="Search by customer name, phone, business, or city..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              icon={Search}
            />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap text-xs">
            {["ALL", "Dealer", "Distributor", "Retailer", "OEM", "Plumber", "Other"].map(
              (t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                    typeFilter === t
                      ? "bg-rn-600 text-white shadow-sm"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  {t}
                </button>
              )
            )}
          </div>
        </div>

        {/* Contacts Table */}
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-6 py-4">Customer / Firm</th>
                  <th className="px-6 py-4">Phone Number</th>
                  <th className="px-6 py-4">Business Type</th>
                  <th className="px-6 py-4">Location</th>
                  <th className="px-6 py-4 text-center">Inquiries</th>
                  <th className="px-6 py-4">Tags</th>
                  <th className="px-6 py-4">Verification</th>
                  <th className="px-6 py-4 text-right">Quick Chat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {loading ? (
                  [1, 2, 3, 4, 5].map((k) => (
                    <tr key={k} className="animate-pulse">
                      <td className="px-6 py-4">
                        <div className="h-3.5 w-28 bg-slate-200 dark:bg-slate-800 rounded"></div>
                        <div className="h-2.5 w-20 bg-slate-100 dark:bg-slate-800/60 rounded mt-1.5"></div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-3 w-24 bg-slate-200 dark:bg-slate-800 rounded"></div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-5 w-16 bg-slate-100 dark:bg-slate-800 rounded-md"></div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-3 w-20 bg-slate-100 dark:bg-slate-800 rounded"></div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="h-3.5 w-6 bg-slate-200 dark:bg-slate-800 rounded mx-auto"></div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-4 w-12 bg-slate-100 dark:bg-slate-800 rounded"></div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-3.5 w-14 bg-slate-100 dark:bg-slate-800 rounded"></div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="h-6 w-16 bg-slate-200 dark:bg-slate-800 rounded ml-auto"></div>
                      </td>
                    </tr>
                  ))
                ) : filteredContacts.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-6 py-12 text-center text-slate-400 dark:text-slate-500 text-xs"
                    >
                      No contacts found matching your criteria.
                    </td>
                  </tr>
                ) : (
                  filteredContacts.map((c) => (
                    <tr
                      key={c._id || c.phone}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-rn-50 dark:bg-rn-950/60 text-rn-700 dark:text-rn-300 font-bold text-xs flex items-center justify-center shrink-0 border border-rn-100 dark:border-rn-900">
                            {c.name ? c.name.charAt(0).toUpperCase() : "C"}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 dark:text-white">
                              {c.name}
                            </div>
                            {c.businessName && (
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                                <Building className="w-3 h-3 text-slate-400 shrink-0" />
                                {c.businessName}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-mono font-medium text-slate-700 dark:text-slate-300">
                        <a
                          href={`https://wa.me/${c.phone?.replace(/[^0-9]/g, "")}`}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:text-emerald-600 flex items-center gap-1"
                        >
                          <Phone className="w-3 h-3 text-emerald-600 shrink-0" />
                          {c.phone}
                        </a>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant="neutral" size="xs">
                          {c.businessType || "Other"}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-slate-600 dark:text-slate-300">
                        {c.city ? `${c.city}${c.state ? `, ${c.state}` : ""}` : "India"}
                      </td>
                      <td className="px-6 py-4 text-center font-bold text-slate-900 dark:text-white">
                        {c.totalEnquiriesCount || 1}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-1 flex-wrap">
                          {(c.tags || []).map((t, i) => (
                            <Badge key={i} variant="info" size="xs">
                              {t}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {c.isVerifiedDealer ? (
                          <Badge variant="success" size="xs" icon={CheckCircle2}>
                            Verified
                          </Badge>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500 text-[11px]">
                            Standard
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link
                          href={`/inbox?phone=${c.phone}`}
                          className="inline-flex items-center gap-1 px-3 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-rn-50 dark:hover:bg-rn-950/60 text-slate-700 dark:text-slate-200 hover:text-rn-600 font-bold rounded-lg text-[11px] transition-colors"
                        >
                          <MessageSquare className="w-3 h-3" />
                          <span>Chat</span>
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </main>
    </div>
  );
}
