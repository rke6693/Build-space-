// Curated food-offers for a given US ZIP, emailed daily by the cron route.
//
// Provider: Yelp Fusion /v3/businesses/search (if YELP_API_KEY is set).
// We pull the top ~40 highly-rated food businesses for the ZIP, keep the ones
// actually open today, prefer places that surface a deal or transaction
// (delivery/pickup/restaurant_reservation), and return the top N.
//
// Without a key we emit a tiny static fallback so the scheduled email still
// delivers something readable on day one — the user can plug YELP_API_KEY in
// later for real data.

import { env } from './env';
import { logger } from './logger';

export type Offer = {
  name: string;
  url: string;
  rating?: number;
  reviewCount?: number;
  price?: string;          // "$", "$$", ...
  categories: string[];
  distanceMeters?: number;
  address?: string;
  phone?: string;
  deal?: string;           // one-line description of why this is today's pick
};

const YELP_SEARCH = 'https://api.yelp.com/v3/businesses/search';

export type YelpBusiness = {
  id: string;
  name: string;
  url: string;
  rating: number;
  review_count: number;
  price?: string;
  is_closed: boolean;
  categories: { alias: string; title: string }[];
  distance?: number;
  transactions?: string[];
  display_phone?: string;
  location?: { display_address?: string[] };
};

type YelpResponse = {
  businesses?: YelpBusiness[];
  error?: { code: string; description: string };
};

export async function fetchOffers(zip: string, limit = 6): Promise<Offer[]> {
  if (!env.YELP_API_KEY) {
    logger.warn({ zip }, 'YELP_API_KEY not set — using static fallback offers');
    return fallbackOffers(zip).slice(0, limit);
  }

  const params = new URLSearchParams({
    location: zip,
    categories: 'restaurants,food',
    sort_by: 'rating',
    limit: '40',
    open_now: 'true',
  });

  const res = await fetch(`${YELP_SEARCH}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${env.YELP_API_KEY}` },
    // Yelp occasionally slow; bound the request so cron never hangs.
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    logger.error({ status: res.status, zip }, 'Yelp search failed; using fallback');
    return fallbackOffers(zip).slice(0, limit);
  }

  const data = (await res.json()) as YelpResponse;
  const businesses = data.businesses ?? [];
  return curate(businesses, limit);
}

// Exposed for tests.
export function curate(businesses: YelpBusiness[], limit: number): Offer[] {
  const eligible = businesses.filter(
    (b) => !b.is_closed && b.review_count >= 25 && b.rating >= 4.0,
  );

  // Score: rating weighted by log(review_count) + bonus for a visible offer
  // (delivery/pickup/reservation imply an active way to redeem today).
  const scored = eligible.map((b) => {
    const txBonus = (b.transactions?.length ?? 0) * 0.15;
    const score = b.rating + Math.log10(Math.max(b.review_count, 10)) * 0.25 + txBonus;
    return { b, score };
  });

  scored.sort((a, z) => z.score - a.score);

  return scored.slice(0, limit).map(({ b }) => ({
    name: b.name,
    url: b.url,
    rating: b.rating,
    reviewCount: b.review_count,
    price: b.price,
    categories: b.categories.map((c) => c.title),
    distanceMeters: b.distance,
    address: b.location?.display_address?.join(', '),
    phone: b.display_phone,
    deal: describeDeal(b),
  }));
}

function describeDeal(b: YelpBusiness): string {
  const tx = b.transactions ?? [];
  const bits: string[] = [];
  if (tx.includes('delivery')) bits.push('Delivery available');
  if (tx.includes('pickup')) bits.push('Pickup available');
  if (tx.includes('restaurant_reservation')) bits.push('Reservations open');
  if (bits.length === 0) return `Top-rated pick (${b.rating}★ · ${b.review_count} reviews)`;
  return bits.join(' · ');
}

// Small starter list for zip 45103 (Batavia, OH) so the cron produces an
// email even before a Yelp key is configured. Users should replace with their
// own picks or configure YELP_API_KEY.
function fallbackOffers(zip: string): Offer[] {
  if (zip !== '45103') {
    return [
      {
        name: 'Configure YELP_API_KEY to see real offers',
        url: 'https://docs.developer.yelp.com/docs/fusion-intro',
        categories: ['Setup'],
        deal: `No fallback list curated for ${zip}. Set YELP_API_KEY in your environment.`,
      },
    ];
  }
  // Neutral search links — real curation kicks in once YELP_API_KEY is set.
  const search = (q: string) =>
    `https://www.yelp.com/search?find_desc=${encodeURIComponent(q)}&find_loc=${zip}`;
  return [
    {
      name: 'Top-rated restaurants near 45103',
      url: search('Restaurants'),
      categories: ['Restaurants'],
      deal: 'Set YELP_API_KEY for a real daily curated list.',
    },
    {
      name: 'Pizza near 45103',
      url: search('Pizza'),
      categories: ['Pizza'],
      deal: 'Browse local pizzerias with today\'s specials.',
    },
    {
      name: 'Breakfast & brunch near 45103',
      url: search('Breakfast'),
      categories: ['Breakfast'],
      deal: 'Morning options for Batavia / Amelia area.',
    },
    {
      name: 'Delivery near 45103',
      url: search('Delivery'),
      categories: ['Delivery'],
      deal: 'Places currently delivering.',
    },
  ];
}
