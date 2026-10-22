export interface GoogleMapsPlace {
  id: string;
  title: string;
  category: string;
  categories: string[];
  address: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  phone?: string;
  website?: string;
  emails: string[];
  rating: number;
  reviewCount: number;
  priceRange?: string;
  latitude?: number;
  longitude?: number;
  mapsUrl?: string;
  placeId?: string;
  cid?: string;
  description?: string;
  socialLinks?: {
    linkedin?: string;
    twitter?: string;
    facebook?: string;
    instagram?: string;
  };
  scrapedAt: string;
}

export interface MapsScrapeOptions {
  query: string;
  location?: string;
  category?: string;
  depth?: number;
  extractEmails?: boolean;
  minRating?: number;
  minReviews?: number;
}
