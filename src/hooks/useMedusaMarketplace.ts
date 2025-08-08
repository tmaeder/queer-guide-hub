import { useCallback, useEffect, useState } from "react";
import { medusa, getMedusaBaseUrl } from "@/integrations/medusa/client";

// Minimal listing shape expected by our UI
export interface MedusaListing {
  id: string;
  title: string;
  business_name?: string | null; // not available in Medusa by default
  description?: string | null;
  category?: string | null;
  subcategory?: string | null;
  price?: number | null; // in major units
  price_type?: "fixed" | "starting_at" | "negotiable" | "free";
  currency?: string | null;
  images?: string[];
  variants?: any[];
  website?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  shipping_available?: boolean;
  shipping_info?: string | null;
  featured?: boolean;
  views_count?: number;
  venues?: { name: string; address: string; city: string } | null;
}

function mapProductToListing(p: any): MedusaListing {
  const firstVariant = p?.variants?.[0];
  const firstPrice = firstVariant?.prices?.[0];
  const amount = typeof firstPrice?.amount === "number" ? firstPrice.amount : null;
  const currency = firstPrice?.currency_code?.toUpperCase?.() || null;

  return {
    id: p.id,
    title: p.title,
    business_name: p?.metadata?.brand || null,
    description: p.description || null,
    category: p?.categories?.[0]?.name || "products",
    subcategory: p?.categories?.[1]?.name || null,
    price: amount != null ? amount / 100 : null,
    price_type: amount === 0 ? "free" : "fixed",
    currency,
    images: Array.isArray(p.images) ? p.images.map((i: any) => i.url).filter(Boolean) : [],
    website: p?.metadata?.website || null,
    contact_phone: null,
    contact_email: null,
    shipping_available: true,
    shipping_info: null,
    featured: !!p?.metadata?.featured,
    views_count: undefined as any, // not tracked in Medusa by default
    venues: null,
  };
}

export function useMedusaMarketplace() {
  const [listings, setListings] = useState<MedusaListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchListings = useCallback(async (filters?: {
    category?: string;
    subcategory?: string;
    location?: string;
    priceRange?: { min: number; max: number };
    tags?: string[];
    search?: string;
    businessType?: string;
  }) => {
    try {
      setLoading(true);
      setError(null);

      const query: Record<string, any> = {};
      if (filters?.search) query.q = filters.search;
      // If you organize collections/categories in Medusa, map here
      // e.g., query.category_id = ...
      if (filters?.tags && filters.tags.length) query.tags = filters.tags;

      const res: any = await medusa.products.list(query as any);
      const mapped = (res.products || []).map(mapProductToListing);

      // Client-side price range filtering fallback
      let filtered = mapped;
      if (filters?.priceRange) {
        filtered = filtered.filter((l) => {
          if (l.price == null) return true;
          return l.price >= filters.priceRange!.min && l.price <= filters.priceRange!.max;
        });
      }

      // Category filter fallback
      if (filters?.category && filters.category !== "all") {
        filtered = filtered.filter((l) => l.category === filters.category || filters.category === "products");
      }

      setListings(filtered);
    } catch (e: any) {
      setError(e?.message || "Failed to fetch products");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  const getProductById = useCallback(async (id: string): Promise<MedusaListing | null> => {
    try {
      const { product } = await medusa.products.retrieve(id);
      return mapProductToListing(product as any);
    } catch (e) {
      console.warn("Failed to retrieve product", e);
      return null;
    }
  }, []);

  // No-ops to preserve previous hook signature in pages
  const createListing = async (_: any) => ({ data: null, error: "Listings are managed in Medusa Admin" });
  const toggleFavorite = async (_: string) => ({ favorited: false, error: "Favorites are not available with Medusa yet" });
  const incrementViews = async (_: string) => {};

  return {
    listings,
    loading,
    error,
    fetchListings,
    createListing,
    toggleFavorite,
    incrementViews,
    refetch: () => fetchListings(),
    getProductById,
  };
}
