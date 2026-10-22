"use client";

import { useState } from "react";
import {
  Building2,
  Check,
  Compass,
  Copy,
  Download,
  Edit3,
  ExternalLink,
  Filter,
  Globe,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Plus,
  RefreshCw,
  Save,
  Search,
  Share2,
  Sliders,
  Sparkles,
  Star,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import type { GoogleMapsPlace } from "@/lib/maps-types";
import { exportPlacesToCSV } from "@/lib/maps-export";

const PRESET_CATEGORIES = [
  { label: "Software & SaaS", category: "Software Company", icon: "💻" },
  { label: "Digital Marketing", category: "Digital Marketing Agency", icon: "📈" },
  { label: "Dentists & Clinics", category: "Dentists", icon: "🩺" },
  { label: "Real Estate Builders", category: "Real Estate Agency", icon: "🏢" },
  { label: "Manufacturers & Exporters", category: "Manufacturing", icon: "🏭" },
  { label: "Accounting & CPAs", category: "Accounting Firm", icon: "💼" },
  { label: "Law Firms & Attorneys", category: "Lawyers", icon: "⚖️" },
  { label: "Plumbers & HVAC", category: "Plumbers and HVAC", icon: "🔧" },
  { label: "Gyms & Fitness", category: "Gym", icon: "🏋️" },
  { label: "Cafes & Restaurants", category: "Restaurant", icon: "☕" },
];

const PRESET_LOCATIONS = [
  { label: "🇮🇳 All India", value: "India" },
  { label: "Bengaluru", value: "Bangalore, India" },
  { label: "Mumbai", value: "Mumbai, India" },
  { label: "Delhi NCR", value: "Delhi, India" },
  { label: "Hyderabad", value: "Hyderabad, India" },
  { label: "Pune", value: "Pune, India" },
  { label: "Chennai", value: "Chennai, India" },
  { label: "Kolkata", value: "Kolkata, India" },
  { label: "Ahmedabad", value: "Ahmedabad, India" },
  { label: "🇺🇸 Austin, TX", value: "Austin, TX" },
  { label: "🇺🇸 San Francisco", value: "San Francisco, CA" },
  { label: "🇬🇧 London", value: "London, UK" },
  { label: "🇦🇪 Dubai", value: "Dubai, UAE" },
];

export default function PortalMapsScraper({
  companyContext,
  getIdToken,
  onAddLead,
  onSaveOpportunity,
  onDraftOutreach,
  setToast,
}: {
  companyContext: Record<string, string>;
  getIdToken: () => Promise<string>;
  onAddLead: (place: GoogleMapsPlace) => Promise<boolean>;
  onSaveOpportunity?: (place: GoogleMapsPlace) => Promise<void>;
  onDraftOutreach?: (place: GoogleMapsPlace) => void;
  setToast: (msg: string) => void;
}) {
  // Default location set to "India" as requested, or company context if specifically set
  const [location, setLocation] = useState(
    companyContext.country && companyContext.country !== "Austin, TX"
      ? companyContext.country
      : "India"
  );
  const [category, setCategory] = useState("Software Company");
  const [customQuery, setCustomQuery] = useState("");
  const [useFreeformQuery, setUseFreeformQuery] = useState(false);
  const [depth, setDepth] = useState(15);
  const [extractEmails, setExtractEmails] = useState(true);
  const [busy, setBusy] = useState(false);
  const [places, setPlaces] = useState<GoogleMapsPlace[]>([]);
  const [lastQuery, setLastQuery] = useState("");
  const [error, setError] = useState("");

  // Filters
  const [filterRating, setFilterRating] = useState<number>(0);
  const [filterHasEmail, setFilterHasEmail] = useState(false);
  const [filterHasWebsite, setFilterHasWebsite] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");

  // Lead Editing State ("everything modifyable")
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editWebsite, setEditWebsite] = useState("");
  const [editEmails, setEditEmails] = useState("");

  // Track imported IDs
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set());
  const [importingAll, setImportingAll] = useState(false);

  const startEditing = (place: GoogleMapsPlace) => {
    setEditingId(place.id);
    setEditTitle(place.title);
    setEditCategory(place.category);
    setEditAddress(place.address);
    setEditPhone(place.phone || "");
    setEditWebsite(place.website || "");
    setEditEmails((place.emails || []).join(", "));
  };

  const cancelEditing = () => {
    setEditingId(null);
  };

  const saveEditing = (id: string) => {
    const cleanedEmails = editEmails
      .split(",")
      .map(e => e.trim().toLowerCase())
      .filter(e => e.includes("@"));

    setPlaces(prev =>
      prev.map(p => {
        if (p.id !== id) return p;
        return {
          ...p,
          title: editTitle.trim() || p.title,
          category: editCategory.trim() || p.category,
          address: editAddress.trim() || p.address,
          phone: editPhone.trim(),
          website: editWebsite.trim(),
          emails: cleanedEmails,
        };
      })
    );
    setEditingId(null);
    setToast("Updated business lead details!");
  };

  const handleDeletePlace = (id: string) => {
    setPlaces(prev => prev.filter(p => p.id !== id));
    setToast("Removed lead from results list.");
  };

  const handleAddCustomLead = () => {
    const newPlace: GoogleMapsPlace = {
      id: `manual-${Date.now()}`,
      title: "New Local Business Lead",
      category: category || "Business",
      categories: [category || "Business"],
      address: location || "India",
      city: location.split(",")[0]?.trim() || "India",
      country: location.toLowerCase().includes("india") ? "India" : "United States",
      phone: location.toLowerCase().includes("india") ? "+91 98450 12345" : "+1 (555) 123-4567",
      website: "https://example.com",
      emails: ["contact@example.com"],
      rating: 4.8,
      reviewCount: 25,
      scrapedAt: new Date().toISOString(),
      mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("Local Business in " + location)}`,
    };
    setPlaces(prev => [newPlace, ...prev]);
    startEditing(newPlace);
    setToast("Added new lead! Edit its details below and click Save.");
  };

  const handleScrape = async (overrideCategory?: string, overrideLocation?: string) => {
    const activeCat = overrideCategory || category;
    const activeLoc = overrideLocation || location;
    const q = useFreeformQuery && customQuery.trim()
      ? customQuery.trim()
      : `${activeCat} in ${activeLoc}`.trim();

    if (!q) {
      setError("Please enter a category and location or custom query.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      let token = "";
      try {
        token = await getIdToken();
      } catch {
        // Optional auth token fallback
      }
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch("/api/discovery/maps", {
        method: "POST",
        headers,
        body: JSON.stringify({
          query: useFreeformQuery ? customQuery.trim() : "",
          category: activeCat,
          location: activeLoc,
          depth,
          extractEmails,
        }),
      });

      const rawText = await res.text();
      let data: { ok?: boolean; places?: GoogleMapsPlace[]; query?: string; error?: string } = {};
      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error(rawText?.slice(0, 150) || `Server responded with status ${res.status}`);
      }

      if (!res.ok) throw new Error(data.error || "Failed to scrape Google Maps.");

      setPlaces(data.places || []);
      setLastQuery(data.query || q);
      setToast(`Scraped ${data.places?.length || 0} business leads from Google Maps!`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scraping failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleExportCSV = () => {
    if (!places.length) return;
    const csvContent = exportPlacesToCSV(filteredPlaces);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `google-maps-leads-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setToast("Downloaded leads CSV!");
  };

  const handleExportJSON = () => {
    if (!places.length) return;
    const jsonContent = JSON.stringify(filteredPlaces, null, 2);
    const blob = new Blob([jsonContent], { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `google-maps-leads-${Date.now()}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setToast("Downloaded leads JSON!");
  };

  const handleSingleImport = async (place: GoogleMapsPlace) => {
    const success = await onAddLead(place);
    if (success) {
      setImportedIds(prev => new Set([...prev, place.id]));
      setToast(`Added ${place.title} to Leads pipeline!`);
    }
  };

  const handleBulkImport = async () => {
    if (!filteredPlaces.length) return;
    setImportingAll(true);
    let count = 0;
    for (const place of filteredPlaces) {
      if (!importedIds.has(place.id)) {
        const ok = await onAddLead(place);
        if (ok) {
          count++;
          setImportedIds(prev => new Set([...prev, place.id]));
        }
      }
    }
    setImportingAll(false);
    setToast(`Bulk imported ${count} Google Maps leads into pipeline!`);
  };

  const filteredPlaces = places.filter(p => {
    if (filterRating > 0 && p.rating < filterRating) return false;
    if (filterHasEmail && p.emails.length === 0) return false;
    if (filterHasWebsite && !p.website) return false;
    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      const match =
        p.title.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.address.toLowerCase().includes(q) ||
        p.emails.some(e => e.toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  const totalWithEmail = places.filter(p => p.emails.length > 0).length;
  const totalWithWebsite = places.filter(p => !!p.website).length;
  const avgRating = places.length
    ? (places.reduce((acc, p) => acc + p.rating, 0) / places.length).toFixed(1)
    : "0.0";

  const activeQueryDisplay = useFreeformQuery && customQuery
    ? customQuery
    : `${category} in ${location}`;

  return (
    <div className="maps-scraper-container">
      {/* Page Header */}
      <div className="page-head">
        <div>
          <div className="eyebrow">
            <span className="pulse-dot" /> GOOGLE MAPS & LOCAL B2B ENGINE
          </div>
          <h1>
            Local Business & Maps Scraper<span className="accent-period">.</span>
          </h1>
          <p>
            Extract verified local business leads, addresses, phones, websites, and emails
            directly from Google Maps for high-converting B2B outreach across India and worldwide.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span className="status-tag" style={{ background: "#eef2ff", color: "#4f46e5" }}>
            Powered by itz-kirankumar/google-maps-scraper
          </span>
          <span className="status-tag" style={{ background: "#ecfdf5", color: "#059669" }}>
            Live Directory Sync Active
          </span>
        </div>
      </div>

      {/* Main Search Configuration Card */}
      <div
        className="mini-card"
        style={{
          padding: 24,
          marginBottom: 24,
          background: "#ffffff",
          border: "1.5px solid var(--line)",
          borderRadius: 14,
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.03)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)" }}>
              Search Parameters
            </span>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>
              (Defaulted to <strong>India</strong>, fully customizable)
            </span>
          </div>

          {/* Toggle between structured category+location and custom freeform */}
          <button
            type="button"
            className="text-link"
            onClick={() => setUseFreeformQuery(prev => !prev)}
            style={{ fontSize: 12, color: "#ff4500", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 5 }}
          >
            <Sliders size={13} />
            {useFreeformQuery ? "Switch to Category + Location Mode" : "Switch to Freeform Query Mode"}
          </button>
        </div>

        {useFreeformQuery ? (
          /* Freeform Custom Query Input */
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em" }}>
              <span>EXACT FREEFORM SEARCH QUERY</span>
              <div style={{ position: "relative" }}>
                <Search
                  size={15}
                  style={{
                    position: "absolute",
                    left: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--muted)",
                  }}
                />
                <input
                  type="text"
                  value={customQuery}
                  onChange={e => setCustomQuery(e.target.value)}
                  placeholder="e.g. Fintech startups in Koramangala Bangalore, Dentists in Mumbai, Export houses in Surat"
                  style={{
                    width: "100%",
                    minHeight: 44,
                    padding: "10px 14px 10px 38px",
                    border: "1.5px solid #d1d5db",
                    borderRadius: "8px",
                    background: "#ffffff",
                    color: "#111827",
                    fontSize: "13px",
                    fontWeight: 500,
                    outline: "none",
                  }}
                />
                {customQuery && (
                  <button
                    type="button"
                    onClick={() => setCustomQuery("")}
                    style={{
                      position: "absolute",
                      right: 12,
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--muted)",
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
            </label>
          </div>
        ) : (
          /* Structured Grid: Category, Location, Leads Depth */
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.2fr 1.2fr 140px",
              gap: 16,
              marginBottom: 16,
            }}
          >
            {/* Business Category Input */}
            <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <Building2 size={13} style={{ color: "#ff4500" }} /> BUSINESS CATEGORY / NICHE
              </span>
              <div style={{ position: "relative" }}>
                <input
                  type="text"
                  value={category}
                  onChange={e => {
                    setCategory(e.target.value);
                  }}
                  placeholder="e.g. Software Company, Dentists, Real Estate"
                  style={{
                    width: "100%",
                    minHeight: 44,
                    padding: "10px 14px",
                    border: "1.5px solid #d1d5db",
                    borderRadius: "8px",
                    background: "#ffffff",
                    color: "#111827",
                    fontSize: "13px",
                    fontWeight: 600,
                    outline: "none",
                  }}
                />
                {category && (
                  <button
                    type="button"
                    onClick={() => setCategory("")}
                    style={{
                      position: "absolute",
                      right: 10,
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--muted)",
                    }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </label>

            {/* Location Input with Default = "India" */}
            <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <MapPin size={13} style={{ color: "#ff4500" }} /> LOCATION / CITY / REGION
              </span>
              <div style={{ position: "relative" }}>
                <input
                  type="text"
                  value={location}
                  onChange={e => {
                    setLocation(e.target.value);
                  }}
                  placeholder="e.g. India, Bangalore, Mumbai, Delhi, Austin TX"
                  style={{
                    width: "100%",
                    minHeight: 44,
                    padding: "10px 14px",
                    border: "1.5px solid #d1d5db",
                    borderRadius: "8px",
                    background: "#ffffff",
                    color: "#111827",
                    fontSize: "13px",
                    fontWeight: 600,
                    outline: "none",
                  }}
                />
                {location && (
                  <button
                    type="button"
                    onClick={() => setLocation("")}
                    style={{
                      position: "absolute",
                      right: 10,
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--muted)",
                    }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </label>

            {/* Leads Depth Dropdown */}
            <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em" }}>
              <span>LEADS DEPTH</span>
              <select
                value={depth}
                onChange={e => setDepth(parseInt(e.target.value, 10))}
                style={{
                  width: "100%",
                  minHeight: 44,
                  padding: "10px 12px",
                  border: "1.5px solid #d1d5db",
                  borderRadius: "8px",
                  background: "#ffffff",
                  color: "#111827",
                  fontSize: "13px",
                  fontWeight: 600,
                  outline: "none",
                  cursor: "pointer",
                }}
              >
                <option value={10}>10 Leads</option>
                <option value={15}>15 Leads</option>
                <option value={25}>25 Leads</option>
                <option value={40}>40 Leads</option>
                <option value={50}>50 Leads</option>
              </select>
            </label>
          </div>
        )}

        {/* Quick Location Pills (India & Global Hubs) */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <MapPin size={12} style={{ color: "var(--muted)" }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Quick Locations:
            </span>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {PRESET_LOCATIONS.map(preset => {
              const active = location.toLowerCase() === preset.value.toLowerCase();
              return (
                <button
                  key={preset.label}
                  type="button"
                  className={`btn ${active ? "btn-dark" : "btn-outline"} small-btn`}
                  onClick={() => {
                    setLocation(preset.value);
                  }}
                  style={{
                    fontSize: 11,
                    padding: "4px 10px",
                    minHeight: 28,
                    borderRadius: 6,
                    background: active ? "#ff4500" : "#ffffff",
                    borderColor: active ? "#ff4500" : "#e2e8f0",
                    color: active ? "#ffffff" : "var(--foreground)",
                  }}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Target Niche Presets */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <Building2 size={12} style={{ color: "var(--muted)" }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Popular Business Niches:
            </span>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {PRESET_CATEGORIES.map(preset => {
              const active = category.toLowerCase() === preset.category.toLowerCase();
              return (
                <button
                  key={preset.label}
                  type="button"
                  className={`btn ${active ? "btn-dark" : "btn-outline"} small-btn`}
                  onClick={() => {
                    setCategory(preset.category);
                  }}
                  style={{
                    fontSize: 11,
                    padding: "4px 10px",
                    minHeight: 28,
                    borderRadius: 6,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    background: active ? "#1e293b" : "#ffffff",
                    borderColor: active ? "#1e293b" : "#e2e8f0",
                    color: active ? "#ffffff" : "var(--foreground)",
                  }}
                >
                  <span>{preset.icon}</span>
                  <span>{preset.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Search Bar Footer: Crawl Checkbox + Active Query String + Scrape Action Button */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingTop: 16,
            borderTop: "1px solid var(--line)",
            flexWrap: "wrap",
            gap: 14,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                cursor: "pointer",
                margin: 0,
                userSelect: "none",
              }}
            >
              <input
                type="checkbox"
                checked={extractEmails}
                onChange={e => setExtractEmails(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: "#ff4500", cursor: "pointer" }}
              />
              <span style={{ fontWeight: 600 }}>Crawl websites for verified emails & socials</span>
            </label>

            <span style={{ fontSize: 12, color: "var(--muted)" }}>
              Active search: <strong style={{ color: "var(--foreground)" }}>{activeQueryDisplay}</strong>
            </span>
          </div>

          <button
            type="button"
            className="btn btn-dark"
            disabled={busy}
            onClick={() => void handleScrape()}
            style={{
              background: "#ff4500",
              borderColor: "#ff4500",
              padding: "11px 24px",
              fontSize: 13,
              fontWeight: 700,
              boxShadow: "0 2px 6px rgba(255, 69, 0, 0.25)",
            }}
          >
            {busy ? (
              <>
                <span className="spinner" style={{ width: 14, height: 14 }} />
                <span>Scraping Google Maps Leads…</span>
              </>
            ) : (
              <>
                <Search size={15} /> Scrape Google Maps Leads
              </>
            )}
          </button>
        </div>

        {error && (
          <div
            style={{
              marginTop: 14,
              padding: "10px 14px",
              background: "#fef2f2",
              border: "1px solid #fee2e2",
              borderRadius: 8,
              color: "#b91c1c",
              fontSize: 12,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={() => void handleScrape()}
              style={{
                background: "none",
                border: "none",
                color: "#b91c1c",
                fontWeight: 700,
                cursor: "pointer",
                textDecoration: "underline",
                fontSize: 11,
              }}
            >
              Retry
            </button>
          </div>
        )}
      </div>

      {/* Metrics Bar when results exist */}
      {places.length > 0 && (
        <div
          className="stats-grid"
          style={{
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            marginBottom: 20,
          }}
        >
          <div className="stat-card" style={{ cursor: "default" }}>
            <div>
              <span>TOTAL PLACES</span>
              <Building2 size={18} />
            </div>
            <strong>{places.length}</strong>
            <small>Direct from Maps</small>
          </div>

          <div className="stat-card" style={{ cursor: "default" }}>
            <div>
              <span>VERIFIED EMAILS</span>
              <Mail size={18} />
            </div>
            <strong>{totalWithEmail}</strong>
            <small>{Math.round((totalWithEmail / places.length) * 100)}% contact rate</small>
          </div>

          <div className="stat-card" style={{ cursor: "default" }}>
            <div>
              <span>WITH WEBSITES</span>
              <Globe size={18} />
            </div>
            <strong>{totalWithWebsite}</strong>
            <small>Enriched contacts</small>
          </div>

          <div className="stat-card" style={{ cursor: "default" }}>
            <div>
              <span>AVG RATING</span>
              <Star size={18} />
            </div>
            <strong>{avgRating}★</strong>
            <small>High review intent</small>
          </div>
        </div>
      )}

      {/* Results Header, Filters, Manual Add, and Bulk Actions */}
      {places.length > 0 && (
        <div
          style={{
            background: "#fff",
            border: "1px solid var(--line)",
            borderRadius: 12,
            padding: "16px 20px",
            marginBottom: 20,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 14,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ position: "relative", minWidth: 200 }}>
              <Search
                size={14}
                style={{
                  position: "absolute",
                  left: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--muted)",
                }}
              />
              <input
                type="text"
                placeholder="Filter by name, city, email…"
                value={searchFilter}
                onChange={e => setSearchFilter(e.target.value)}
                style={{
                  paddingLeft: 30,
                  fontSize: 12,
                  minHeight: 34,
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  outline: "none",
                }}
              />
            </div>

            <select
              value={filterRating}
              onChange={e => setFilterRating(parseFloat(e.target.value))}
              style={{ minHeight: 34, fontSize: 12, borderRadius: 8, border: "1px solid #d1d5db" }}
            >
              <option value={0}>All Ratings</option>
              <option value={4.0}>Rating ≥ 4.0★</option>
              <option value={4.5}>Rating ≥ 4.5★</option>
            </select>

            <button
              type="button"
              className={`btn ${filterHasEmail ? "btn-dark" : "btn-outline"} small-btn`}
              onClick={() => setFilterHasEmail(v => !v)}
              style={{ fontSize: 11 }}
            >
              Has Email
            </button>

            <button
              type="button"
              className={`btn ${filterHasWebsite ? "btn-dark" : "btn-outline"} small-btn`}
              onClick={() => setFilterHasWebsite(v => !v)}
              style={{ fontSize: 11 }}
            >
              Has Website
            </button>

            {/* Everything Modifiable: Add Custom Lead Manually */}
            <button
              type="button"
              className="btn btn-outline small-btn"
              onClick={handleAddCustomLead}
              style={{ fontSize: 11, display: "inline-flex", alignItems: "center", gap: 5, color: "#ff4500", borderColor: "#fed7aa" }}
            >
              <Plus size={13} /> Add Custom Lead
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-dark small-btn"
              disabled={importingAll || !filteredPlaces.length}
              onClick={handleBulkImport}
              style={{ fontSize: 12, background: "#16a34a", borderColor: "#16a34a" }}
            >
              {importingAll ? (
                <>
                  <span className="spinner" style={{ width: 12, height: 12 }} />
                  <span>Importing…</span>
                </>
              ) : (
                <>
                  <UserPlus size={14} /> Bulk Import ({filteredPlaces.length})
                </>
              )}
            </button>

            <button
              type="button"
              className="btn btn-outline small-btn"
              onClick={handleExportCSV}
              style={{ fontSize: 12 }}
            >
              <Download size={13} /> Export CSV
            </button>

            <button
              type="button"
              className="btn btn-outline small-btn"
              onClick={handleExportJSON}
              style={{ fontSize: 12 }}
            >
              <Download size={13} /> Export JSON
            </button>
          </div>
        </div>
      )}

      {/* Place Results Grid ("everything modifyable") */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {filteredPlaces.map(place => {
          const isImported = importedIds.has(place.id);
          const isEditing = editingId === place.id;

          if (isEditing) {
            /* Inline Edit Form for this place */
            return (
              <div
                key={place.id}
                style={{
                  background: "#fff",
                  border: "2px solid #ff4500",
                  borderRadius: 12,
                  padding: "20px 22px",
                  boxShadow: "0 4px 14px rgba(255, 69, 0, 0.12)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Edit3 size={15} style={{ color: "#ff4500" }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)" }}>
                      Edit Business Lead Details
                    </span>
                  </div>
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>ID: {place.id}</span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 14, marginBottom: 12 }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, fontWeight: 700 }}>
                    <span>BUSINESS NAME / TITLE</span>
                    <input
                      type="text"
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, fontWeight: 600 }}
                    />
                  </label>

                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, fontWeight: 700 }}>
                    <span>CATEGORY / NICHE</span>
                    <input
                      type="text"
                      value={editCategory}
                      onChange={e => setEditCategory(e.target.value)}
                      style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13 }}
                    />
                  </label>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14, marginBottom: 12 }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, fontWeight: 700 }}>
                    <span>FULL ADDRESS</span>
                    <input
                      type="text"
                      value={editAddress}
                      onChange={e => setEditAddress(e.target.value)}
                      style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 12 }}
                    />
                  </label>

                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, fontWeight: 700 }}>
                    <span>PHONE NUMBER</span>
                    <input
                      type="text"
                      value={editPhone}
                      onChange={e => setEditPhone(e.target.value)}
                      placeholder="+91 ... / +1 ..."
                      style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 12 }}
                    />
                  </label>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, fontWeight: 700 }}>
                    <span>WEBSITE URL</span>
                    <input
                      type="text"
                      value={editWebsite}
                      onChange={e => setEditWebsite(e.target.value)}
                      placeholder="https://..."
                      style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 12 }}
                    />
                  </label>

                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, fontWeight: 700 }}>
                    <span>EMAILS (COMMA SEPARATED)</span>
                    <input
                      type="text"
                      value={editEmails}
                      onChange={e => setEditEmails(e.target.value)}
                      placeholder="contact@company.in, sales@company.com"
                      style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 12 }}
                    />
                  </label>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                  <button
                    type="button"
                    className="btn btn-outline small-btn"
                    onClick={cancelEditing}
                    style={{ fontSize: 12 }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-dark small-btn"
                    onClick={() => saveEditing(place.id)}
                    style={{ background: "#16a34a", borderColor: "#16a34a", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 5 }}
                  >
                    <Save size={13} /> Save Lead Changes
                  </button>
                </div>
              </div>
            );
          }

          /* Normal View Card for this place */
          return (
            <div
              key={place.id}
              style={{
                background: "#fff",
                border: "1px solid var(--line)",
                borderRadius: 12,
                padding: "20px 22px",
                display: "flex",
                justifyContent: "space-between",
                gap: 20,
                alignItems: "flex-start",
                transition: "border-color 0.15s, box-shadow 0.15s",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Title & Category & Rating */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "var(--foreground)" }}>
                    {place.title}
                  </h3>
                  <span
                    style={{
                      background: "#f3f4f6",
                      color: "#374151",
                      fontSize: 11,
                      fontWeight: 600,
                      padding: "2px 8px",
                      borderRadius: 12,
                    }}
                  >
                    {place.category}
                  </span>
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      background: "#fffbeb",
                      color: "#92400e",
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: 12,
                      border: "1px solid #fef3c7",
                    }}
                  >
                    <Star size={12} style={{ fill: "#f59e0b", color: "#f59e0b" }} />
                    <span>{place.rating.toFixed(1)}</span>
                    <span style={{ color: "#b45309", fontWeight: 500 }}>
                      ({place.reviewCount} reviews)
                    </span>
                  </div>
                </div>

                {/* Address */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12.5,
                    color: "var(--muted)",
                    marginBottom: 8,
                  }}
                >
                  <MapPin size={14} style={{ color: "#ff4500", flexShrink: 0 }} />
                  <span>{place.address}</span>
                  {place.mapsUrl && (
                    <a
                      href={place.mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 2,
                        color: "#2563eb",
                        fontSize: 11,
                        marginLeft: 6,
                        textDecoration: "none",
                      }}
                    >
                      View on Maps <ExternalLink size={11} />
                    </a>
                  )}
                </div>

                {/* Phone & Website & Socials */}
                <div
                  style={{
                    display: "flex",
                    gap: 16,
                    alignItems: "center",
                    flexWrap: "wrap",
                    fontSize: 12,
                    marginBottom: 8,
                  }}
                >
                  {place.phone && (
                    <a
                      href={`tel:${place.phone}`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        color: "var(--foreground)",
                        textDecoration: "none",
                        fontWeight: 500,
                      }}
                    >
                      <Phone size={13} style={{ color: "var(--muted)" }} />
                      <span>{place.phone}</span>
                    </a>
                  )}

                  {place.website && (
                    <a
                      href={place.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        color: "#2563eb",
                        textDecoration: "none",
                      }}
                    >
                      <Globe size={13} />
                      <span>{place.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, "")}</span>
                      <ExternalLink size={11} />
                    </a>
                  )}

                  {place.socialLinks && Object.keys(place.socialLinks).length > 0 && (
                    <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                      {place.socialLinks.linkedin && (
                        <a
                          href={place.socialLinks.linkedin}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="LinkedIn"
                          style={{ color: "#0a66c2" }}
                        >
                          <Share2 size={13} />
                        </a>
                      )}
                      {place.socialLinks.twitter && (
                        <a
                          href={place.socialLinks.twitter}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Twitter / X"
                          style={{ color: "#000" }}
                        >
                          <Share2 size={13} />
                        </a>
                      )}
                    </div>
                  )}
                </div>

                {/* Emails */}
                {place.emails.length > 0 && (
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <Mail size={13} style={{ color: "#16a34a" }} />
                    {place.emails.map(email => (
                      <span
                        key={email}
                        style={{
                          background: "#f0fdf4",
                          border: "1px solid #dcfce7",
                          color: "#166534",
                          fontSize: 11,
                          fontWeight: 600,
                          padding: "2px 8px",
                          borderRadius: 6,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        {email}
                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard.writeText(email);
                            setToast(`Copied ${email}!`);
                          }}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: 0,
                            color: "#15803d",
                            display: "inline-flex",
                          }}
                          title="Copy email"
                        >
                          <Copy size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Action Buttons for this Place */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  flexShrink: 0,
                }}
              >
                <button
                  type="button"
                  className={`btn ${isImported ? "btn-outline" : "btn-dark"} small-btn`}
                  disabled={isImported}
                  onClick={() => void handleSingleImport(place)}
                  style={{
                    minWidth: 120,
                    fontSize: 12,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  {isImported ? (
                    <>
                      <Check size={13} style={{ color: "#16a34a" }} /> Added
                    </>
                  ) : (
                    <>
                      <UserPlus size={13} /> Add to Leads
                    </>
                  )}
                </button>

                <div style={{ display: "flex", gap: 6 }}>
                  {/* Inline Edit button */}
                  <button
                    type="button"
                    className="btn btn-outline small-btn"
                    onClick={() => startEditing(place)}
                    style={{ flex: 1, fontSize: 11, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4 }}
                    title="Edit lead details before importing"
                  >
                    <Edit3 size={11} /> Edit
                  </button>

                  {/* Delete button */}
                  <button
                    type="button"
                    className="btn btn-outline small-btn"
                    onClick={() => handleDeletePlace(place.id)}
                    style={{ fontSize: 11, color: "#dc2626", borderColor: "#fecaca", padding: "0 8px" }}
                    title="Remove lead"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>

                {onDraftOutreach && (
                  <button
                    type="button"
                    className="btn btn-outline small-btn"
                    onClick={() => onDraftOutreach(place)}
                    style={{
                      minWidth: 120,
                      fontSize: 12,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    <MessageSquare size={13} /> Draft Pitch
                  </button>
                )}

                {onSaveOpportunity && (
                  <button
                    type="button"
                    className="btn btn-outline small-btn"
                    onClick={() => void onSaveOpportunity(place)}
                    style={{
                      minWidth: 120,
                      fontSize: 12,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    <Compass size={13} /> Save to Radar
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {!busy && places.length === 0 && (
          <div
            style={{
              padding: "48px 20px",
              textAlign: "center",
              background: "#fff",
              border: "1px dashed var(--line)",
              borderRadius: 12,
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                background: "#fff6f2",
                color: "#ff4500",
                display: "grid",
                placeItems: "center",
                margin: "0 auto 14px",
              }}
            >
              <MapPin size={24} />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 6px" }}>
              Ready to scrape local business leads
            </h3>
            <p
              style={{
                color: "var(--muted)",
                fontSize: 13,
                maxWidth: 480,
                margin: "0 auto 18px",
              }}
            >
              Defaulted to India. Enter any city, state, or country (e.g. Bangalore, Mumbai, Delhi, Austin TX, London)
              and business niche to extract verified leads, websites, and direct emails.
            </p>
            <button
              type="button"
              className="btn btn-dark"
              onClick={() => void handleScrape()}
              style={{
                background: "#ff4500",
                borderColor: "#ff4500",
                fontSize: 13,
                fontWeight: 600,
                padding: "10px 22px",
              }}
            >
              <Sparkles size={14} /> Start Scraping ({category} in {location})
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
