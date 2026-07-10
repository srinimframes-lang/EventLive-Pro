import { resolveLayoutVariant } from '../../../utils/themeLayouts.js';
import {
  CrystalWeddingLayout,
  EmeraldWeddingLayout,
  FloralGardenLayout,
  LuxuryGoldLayout,
  ModernMinimalLayout,
  NightSkyWeddingLayout,
  RoyalPalaceLayout,
  SouthIndianTraditionalLayout,
  SunsetRomanceLayout,
  VintageClassicLayout,
} from './allLayouts.jsx';
import { ReceptionCrystalLayout, ReceptionRoyalNightLayout } from './receptionLayouts.jsx';

const LAYOUT_MAP = {
  'royal-palace': RoyalPalaceLayout,
  'luxury-gold': LuxuryGoldLayout,
  'floral-garden': FloralGardenLayout,
  'south-indian-traditional': SouthIndianTraditionalLayout,
  'modern-minimal': ModernMinimalLayout,
  'sunset-romance': SunsetRomanceLayout,
  'emerald-wedding': EmeraldWeddingLayout,
  'vintage-classic': VintageClassicLayout,
  'crystal-wedding': CrystalWeddingLayout,
  'night-sky-wedding': NightSkyWeddingLayout,
  'reception-royal-night': ReceptionRoyalNightLayout,
  'reception-crystal': ReceptionCrystalLayout,
};

export function getThemeLayoutComponent(snapshot) {
  const key = resolveLayoutVariant(snapshot);
  return LAYOUT_MAP[key] || RoyalPalaceLayout;
}

export { LAYOUT_MAP };
