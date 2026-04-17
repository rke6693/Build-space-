import { describe, it, expect } from 'vitest';
import { curate, type Offer, type YelpBusiness } from '../../lib/food-offers';
import { renderSubject, renderText, renderHtml } from '../../lib/email';

function biz(overrides: Partial<YelpBusiness> = {}): YelpBusiness {
  return {
    id: 'b',
    name: 'Test Diner',
    url: 'https://example.com',
    rating: 4.5,
    review_count: 100,
    is_closed: false,
    categories: [{ alias: 'american', title: 'American' }],
    transactions: [],
    ...overrides,
  };
}

describe('curate', () => {
  it('drops closed businesses and low-signal picks', () => {
    const out = curate(
      [
        biz({ id: '1', is_closed: true }),
        biz({ id: '2', review_count: 5 }),           // too few reviews
        biz({ id: '3', rating: 3.5 }),                // too low rated
        biz({ id: '4', rating: 4.6, review_count: 300 }),
      ],
      5,
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.rating).toBe(4.6);
  });

  it('prefers businesses with active transactions at equal rating', () => {
    const out = curate(
      [
        biz({ id: 'a', name: 'Plain', rating: 4.5, review_count: 200, transactions: [] }),
        biz({ id: 'b', name: 'WithTx', rating: 4.5, review_count: 200, transactions: ['delivery'] }),
      ],
      2,
    );
    expect(out[0]?.name).toBe('WithTx');
  });

  it('caps output at the requested limit', () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      biz({ id: `${i}`, name: `r${i}`, rating: 4.5, review_count: 100 + i }),
    );
    expect(curate(items, 3)).toHaveLength(3);
  });

  it('synthesizes a human-readable deal string', () => {
    const [o] = curate(
      [biz({ transactions: ['delivery', 'pickup'], rating: 4.7, review_count: 500 })],
      1,
    );
    expect(o?.deal).toContain('Delivery');
    expect(o?.deal).toContain('Pickup');
  });
});

describe('email composition', () => {
  const offers: Offer[] = [
    {
      name: 'Pampas Grill',
      url: 'https://example.com/pampas',
      rating: 4.6,
      reviewCount: 321,
      price: '$$',
      categories: ['Brazilian'],
      distanceMeters: 2414,
      address: '123 Main St, Batavia, OH',
      deal: 'Delivery available · Pickup available',
    },
  ];

  it('subject includes the zip and date', () => {
    const s = renderSubject('45103', 'Friday, April 17');
    expect(s).toContain('45103');
    expect(s).toContain('April 17');
  });

  it('text renders each offer with name, meta, and url', () => {
    const t = renderText({ zip: '45103', dateLabel: 'Friday, April 17', offers });
    expect(t).toContain('Pampas Grill');
    expect(t).toContain('https://example.com/pampas');
    expect(t).toContain('4.6★');
    expect(t).toContain('1.5 mi');
  });

  it('html escapes user-controlled fields (XSS guard)', () => {
    const evil: Offer[] = [
      {
        name: '<script>alert(1)</script>',
        url: 'https://example.com/x',
        categories: ['"\'><svg>'],
        deal: 'Delivery <img src=x onerror=1>',
      },
    ];
    const html = renderHtml({ zip: '45103', dateLabel: 'today', offers: evil });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('onerror=1>');
  });
});
