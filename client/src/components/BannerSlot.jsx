import { useCallback, useEffect, useRef, useState } from 'react';
import { bannerService } from '../services/banner.service.js';
import { whatsappLink } from '../utils/format.js';
import BannerFrame from './BannerFrame.jsx';

const ROTATE_MS = 10_000;

/**
 * Responsive banner ad slot — preserves aspect ratio, auto-rotates every 10s.
 * @param {{ location: string, className?: string }} props
 */
export default function BannerSlot({ location, className = '' }) {
  const [banners, setBanners] = useState([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const viewedRef = useRef(new Set());

  useEffect(() => {
    let active = true;
    setLoading(true);
    bannerService
      .listActive(location)
      .then((list) => {
        if (!active) return;
        setBanners(list || []);
        setIndex(0);
        viewedRef.current = new Set();
      })
      .catch(() => active && setBanners([]))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [location]);

  const count = banners.length;
  const current = count > 0 ? banners[index % count] : null;

  const recordView = useCallback((banner) => {
    if (!banner?.id && !banner?._id) return;
    const id = banner.id || banner._id;
    if (viewedRef.current.has(id)) return;
    viewedRef.current.add(id);
    bannerService.trackView(id);
  }, []);

  useEffect(() => {
    if (!current) return undefined;
    recordView(current);
    if (count <= 1) return undefined;
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % count);
    }, ROTATE_MS);
    return () => clearInterval(timer);
  }, [count, current, recordView]);

  useEffect(() => {
    if (!current || count <= 1) return;
    recordView(current);
  }, [index, current, count, recordView]);

  const handleClick = async (e) => {
    e.preventDefault();
    const banner = current;
    const id = banner?.id || banner?._id;
    if (!id) return;

    let result;
    try {
      result = await bannerService.trackClick(id);
    } catch {
      result = banner;
    }

    if (result?.clickUrl) {
      window.open(result.clickUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    const wa = whatsappLink(result?.whatsappNumber || banner.whatsappNumber);
    if (wa) {
      window.open(wa, '_blank', 'noopener,noreferrer');
      return;
    }
    const phone = result?.phoneNumber || banner.phoneNumber;
    if (phone) {
      window.location.href = `tel:${String(phone).replace(/[^\d+]/g, '')}`;
    }
  };

  if (loading || !current) return null;

  return (
    <aside
      className={`banner-slot mx-auto w-full ${className}`.trim()}
      aria-label="Advertisement"
      data-banner-location={location}
    >
      <div className="mb-1 flex items-center justify-between px-0.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Ad</span>
        {count > 1 && (
          <span className="text-[10px] text-slate-400">
            {index + 1} / {count}
          </span>
        )}
      </div>

      <BannerFrame
        banner={current}
        onClick={handleClick}
        autoPlay
        ariaLabel={current.companyName ? `Advertisement: ${current.companyName}` : 'Advertisement'}
        mediaClassName="transition group-hover:opacity-95"
      />

      {current.companyName && (
        <p className="mt-1 truncate text-center text-[11px] text-slate-500">{current.companyName}</p>
      )}

      {count > 1 && (
        <div className="mt-2 flex justify-center gap-1.5" aria-hidden>
          {banners.map((b, i) => (
            <span
              key={b.id || b._id}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? 'w-4 bg-brand-500' : 'w-1.5 bg-slate-300'
              }`}
            />
          ))}
        </div>
      )}
    </aside>
  );
}
