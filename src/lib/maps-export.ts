import type { GoogleMapsPlace } from "./maps-types";

/** Convert discovered places into the CSV format expected by the Maps tool. */
export function exportPlacesToCSV(places: GoogleMapsPlace[]): string {
  const headers = [
    "title",
    "category",
    "address",
    "city",
    "country",
    "phone",
    "web_site",
    "emails",
    "review_rating",
    "review_count",
    "latitude",
    "longitude",
    "link",
  ];

  const rows = places.map(place => [
    `"${(place.title || "").replace(/"/g, '""')}"`,
    `"${(place.category || "").replace(/"/g, '""')}"`,
    `"${(place.address || "").replace(/"/g, '""')}"`,
    `"${(place.city || "").replace(/"/g, '""')}"`,
    `"${(place.country || "").replace(/"/g, '""')}"`,
    `"${(place.phone || "").replace(/"/g, '""')}"`,
    `"${(place.website || "").replace(/"/g, '""')}"`,
    `"${(place.emails || []).join(", ").replace(/"/g, '""')}"`,
    place.rating.toString(),
    place.reviewCount.toString(),
    place.latitude?.toString() || "",
    place.longitude?.toString() || "",
    `"${(place.mapsUrl || "").replace(/"/g, '""')}"`,
  ]);

  return [headers.join(","), ...rows.map(row => row.join(","))].join("\n");
}
