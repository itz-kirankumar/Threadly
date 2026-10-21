"use client";

import { useState } from "react";
import {
  Building2,
  Check,
  Compass,
  Copy,
  Download,
  ExternalLink,
  Filter,
  Globe,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  RefreshCw,
  Search,
  Share2,
  Sparkles,
  Star,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import type { GoogleMapsPlace } from "@/lib/maps-scraper";
import { exportPlacesToCSV } from "@/lib/maps-scraper";

const PRESET_CATEGORIES = [
  { label: "Dentists & Dental", category: "Dentists", icon: "🩺" },
  { label: "Plumbers & HVAC", category: "Plumbers and HVAC", icon: "🔧" },
  { label: "Law Firms & Attorneys", category: "Lawyers", icon: "⚖️" },
  { label: "Real Estate Agents", category: "Real Estate Agency", icon: "🏠" },
  { label: "B2B SaaS & Tech", category: "Software Company", icon: "💻" },
  { label: "Marketing Agencies", category: "Digital Marketing Agency", icon: "📈" },
  { label: "Gyms & Fitness", category: "Gym", icon: "🏋️" },
  { label: "Accounting & CPAs", category: "Accounting Firm", icon: "💼" },
  { label: "Roofing & Contractors", category: "Roofing Contractor", icon: "🔨" },
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
  const [category, setCategory] = useState("Dentists");
  const [location, setLocation] = useState(
    companyContext.country || companyContext.region || "Austin, TX"
  );
  const [customQuery, setCustomQuery] = useState("");
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

  // Track imported IDs
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set());
  const [importingAll, setImportingAll] = useState(false);

  const handleScrape = async (overrideCategory?: string) => {
    const selectedCat = overrideCategory || category;
    const q = customQuery.trim() || `${selectedCat} in ${location}`.trim();
    if (!q) {
      setError("Please enter a category and location or custom query.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const token = await getIdToken();
      const res = await fetch("/api/discovery/maps", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          query: customQuery.trim(),
          category: selectedCat,
          location,
          depth,
          extractEmails,
        }),
      });

      const data = await res.json();
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
            directly from Google Maps for high-converting B2B outreach.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span className="status-tag" style={{ background: "#eef2ff", color: "#4f46e5" }}>
            Powered by itz-kirankumar/google-maps-scraper
          </span>
        </div>
      </div>

      {/* Preset Category Pills */}
      <div style={{ marginBottom: 18 }}>
        <span
          style={{
            display: "block",
            fontSize: 11,
            fontWeight: 700,
            color: "var(--muted)",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          TARGET NICHE PRESETS
        </span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {PRESET_CATEGORIES.map(preset => {
            const active = category === preset.category && !customQuery;
            return (
              <button
                key={preset.label}
                type="button"
                className={`btn ${active ? "btn-dark" : "btn-outline"} small-btn`}
                onClick={() => {
                  setCategory(preset.category);
                  setCustomQuery("");
                  void handleScrape(preset.category);
                }}
                style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <span>{preset.icon}</span>
                <span>{preset.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Search Configuration Card */}
      <div className="mini-card" style={{ padding: 24, marginBottom: 24 }}>
        <div className="dialog-grid" style={{ gridTemplateColumns: "1.2fr 1fr 140px" }}>
          <label>
            BUSINESS CATEGORY / NICHE
            <input
              type="text"
              value={category}
              onChange={e => {
                setCategory(e.target.value);
                setCustomQuery("");
              }}
              placeholder="e.g. Dentists, HVAC, Real Estate"
            />
          </label>

          <label>
            LOCATION / CITY / REGION
            <input
              type="text"
              value={location}
              onChange={e => {
                setLocation(e.target.value);
                setCustomQuery("");
              }}
              placeholder="e.g. Austin TX, Berlin Germany, London"
            />
          </label>

          <label>
            LEADS DEPTH
            <select
              value={depth}
              onChange={e => setDepth(parseInt(e.target.value, 10))}
            >
              <option value={10}>10 Leads</option>
              <option value={15}>15 Leads</option>
              <option value={25}>25 Leads</option>
              <option value={40}>40 Leads</option>
            </select>
          </label>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 14,
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                cursor: "pointer",
                margin: 0,
              }}
            >
              <input
                type="checkbox"
                checked={extractEmails}
                onChange={e => setExtractEmails(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: "#ff4500" }}
              />
              <span style={{ fontWeight: 600 }}>Crawl websites for emails & socials</span>
            </label>

            <span style={{ fontSize: 11, color: "var(--muted)" }}>
              Search query: <strong>{customQuery || `${category} in ${location}`}</strong>
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
              padding: "10px 22px",
              fontSize: 13,
            }}
          >
            {busy ? (
              <>
                <span className="spinner" style={{ width: 14, height: 14 }} />
                <span>Scraping Google Maps…</span>
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
            }}
          >
            {error}
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

      {/* Results Header, Filters, and Bulk Actions */}
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
                }}
              />
            </div>

            <select
              value={filterRating}
              onChange={e => setFilterRating(parseFloat(e.target.value))}
              style={{ minHeight: 34, fontSize: 12, borderRadius: 8 }}
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
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-dark small-btn"
              disabled={importingAll || !filteredPlaces.length}
              onClick={handleBulkImport}
              style={{ fontSize: 12 }}
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

      {/* Place Results Grid */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {filteredPlaces.map(place => {
          const isImported = importedIds.has(place.id);
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
              <MapPin size={26} />
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 6px" }}>
              Ready to scrape local business leads
            </h3>
            <p style={{ fontSize: 13, color: "var(--muted)", maxWidth: 440, margin: "0 auto 16px" }}>
              Select a preset niche above or enter any city and business category (e.g. Dentists in Berlin, Roofing in Austin TX) to extract contact details.
            </p>
            <button
              type="button"
              className="btn btn-dark"
              onClick={() => void handleScrape()}
            >
              <Search size={15} /> Scrape {category} in {location}
            </button>
          </div>
        )}
      </div>

      {/* Docker / Agent Skill Info Callout */}
      <div
        style={{
          marginTop: 28,
          padding: "16px 20px",
          background: "#faf9f7",
          border: "1px solid var(--line)",
          borderRadius: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Sparkles size={20} style={{ color: "#ff4500", flexShrink: 0 }} />
          <div>
            <strong style={{ fontSize: 13, display: "block" }}>
              Agent Skill & CLI Integration Active
            </strong>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>
              The <code>google-maps-scraper</code> skill is installed. You can also run high-volume distributed crawls via Docker with <code>npx skills add gosom/google-maps-scraper</code>.
            </span>
          </div>
        </div>
        <a
          href="https://github.com/itz-kirankumar/google-maps-scraper"
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-outline small-btn"
          style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          View GitHub Repository <ExternalLink size={13} />
        </a>
      </div>
    </div>
  );
}
