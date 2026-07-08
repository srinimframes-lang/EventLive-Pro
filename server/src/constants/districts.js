/** South Indian districts served by EventLive Pro (maps to theme regions). */
export const DISTRICTS = [
  {
    slug: 'telangana',
    region: 'telangana',
    name: 'Telangana',
    headline: 'Wedding Live Streaming in Telangana',
    description:
      'Watch Telugu weddings live from Hyderabad, Warangal, and across Telangana. HD streams, photo galleries, and shareable links for family worldwide.',
    keywords: ['Telangana wedding live', 'Hyderabad wedding stream', 'Telugu wedding online'],
  },
  {
    slug: 'andhra-pradesh',
    region: 'andhra',
    name: 'Andhra Pradesh',
    headline: 'Wedding Live Streaming in Andhra Pradesh',
    description:
      'Live stream weddings from Vijayawada, Visakhapatnam, and all of Andhra Pradesh. Premium HD viewing with instant guest links.',
    keywords: ['Andhra wedding live', 'Vijayawada wedding stream', 'Telugu wedding live'],
  },
  {
    slug: 'tamil-nadu',
    region: 'tamil_nadu',
    name: 'Tamil Nadu',
    headline: 'Wedding Live Streaming in Tamil Nadu',
    description:
      'Stream Tamil weddings live from Chennai, Coimbatore, Madurai, and beyond. Beautiful themed pages and photo galleries for guests.',
    keywords: ['Tamil wedding live', 'Chennai wedding stream', 'Tamil Nadu wedding online'],
  },
  {
    slug: 'kerala',
    region: 'kerala',
    name: 'Kerala',
    headline: 'Wedding Live Streaming in Kerala',
    description:
      'Watch Kerala weddings live — from Kochi to Thiruvananthapuram. Elegant streams with gallery photos and easy sharing on WhatsApp.',
    keywords: ['Kerala wedding live', 'Kochi wedding stream', 'Malayalam wedding online'],
  },
];

export function districtBySlug(slug) {
  return DISTRICTS.find((d) => d.slug === slug) || null;
}

export function districtByRegion(region) {
  return DISTRICTS.find((d) => d.region === region) || null;
}

export function regionFromDistrictSlug(slug) {
  return districtBySlug(slug)?.region || '';
}
