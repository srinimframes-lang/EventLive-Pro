/**
 * Shared Event.category slug list (Mongo enum + API filters).
 * Keep in sync with client/src/config/eventTypes.js (UI catalogue).
 *
 * themeCategoryKey mapping lives on the client only for now — themes are not
 * auto-selected from event type yet.
 */
export const EVENT_CATEGORIES = [
  // Wedding Events
  'wedding',
  'reception',
  'engagement',
  'haldi',
  'mehendi',
  'sangeet',
  'pellikuthuru',
  'pellikoduku',
  // Family Events
  'birthday',
  'anniversary',
  'baby_shower',
  'naming_ceremony',
  'half_saree',
  'house_warming',
  // Religious Events
  'temple_event',
  'homam',
  'pooja',
  'church_event',
  'bhajan',
  // Business Events
  'conference',
  'webinar',
  'workshop',
  // Entertainment
  'concert',
  'sports',
  // Other + legacy (existing Mongo documents)
  'other',
  'meetup',
];
