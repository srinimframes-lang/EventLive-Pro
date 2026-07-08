import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSettings } from '../context/SettingsContext.jsx';
import { packageService } from '../services/package.service.js';
import SiteSeo from '../components/seo/SiteSeo.jsx';
import { truncate } from '../utils/seo.js';

const steps = [
  { n: '01', title: 'Choose a package', desc: 'Pick the wedding streaming package that fits your celebration.' },
  { n: '02', title: 'Confirm payment', desc: 'Pay via UPI, GPay, PhonePe, Paytm or bank transfer and upload the receipt.' },
  { n: '03', title: 'We go live', desc: 'Our team streams your big day in HD to a private watch link for your guests.' },
];

export default function Home() {
  const { settings } = useSettings();
  const [packages, setPackages] = useState([]);

  useEffect(() => {
    packageService
      .list()
      .then(setPackages)
      .catch(() => setPackages([]));
  }, []);

  const wa = whatsappLink(settings.whatsappNumber, `Hi ${settings.companyName}, I'd like to book a wedding live stream.`);

  return (
    <>
      <SiteSeo
        path="/"
        title={
          settings.seo?.homepageTitle ||
          `${settings.companyName} — ${settings.tagline || 'Premium Wedding Live Streaming'}`
        }
        description={
          settings.seo?.homepageDescription ||
          truncate(
            `${settings.companyName} streams weddings and celebrations live in HD. Photo galleries, themed pages, and instant share links for guests worldwide.`,
            300
          )
        }
      />
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700 text-white">
        <div className="absolute inset-0 opacity-20 [background:radial-gradient(circle_at_20%_20%,#fff,transparent_40%),radial-gradient(circle_at_80%_0,#f5ebd5,transparent_35%)]" />
        <div className="relative mx-auto max-w-6xl px-4 py-20 sm:py-28">
          <span className="badge bg-white/15 text-gold-200 ring-1 ring-white/20">
            {settings.tagline || 'Premium Wedding Live Streaming'}
          </span>
          <h1 className="mt-5 max-w-3xl font-display text-4xl font-bold leading-tight sm:text-6xl">
            Share your wedding day with everyone you love — live & in HD.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-brand-100">
            {settings.companyName} streams your ceremony to a private link so family and friends
            anywhere in the world can celebrate with you in real time.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link to="/book" className="btn-gold px-7 py-3 text-base">
              Book Now
            </Link>
            <Link to="/login" className="btn px-7 py-3 text-base bg-white text-brand-700 hover:bg-brand-50">
              Customer Login
            </Link>
            <Link
              to="/events"
              className="btn px-7 py-3 text-base bg-white/10 text-white ring-1 ring-white/30 hover:bg-white/20"
            >
              Watch Live
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-center font-display text-3xl font-bold text-slate-900">How it works</h2>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="card">
              <span className="font-display text-3xl font-bold text-gold-500">{s.n}</span>
              <h3 className="mt-3 text-lg font-bold text-slate-900">{s.title}</h3>
              <p className="mt-2 text-slate-600">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Packages */}
      {packages.length > 0 && (
        <section className="bg-white py-16">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-center font-display text-3xl font-bold text-slate-900">
              Our packages
            </h2>
            <p className="mt-2 text-center text-slate-600">
              Transparent pricing for every kind of celebration.
            </p>
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {packages.map((p, i) => (
                <div
                  key={p.id}
                  className={`card flex flex-col ${i === 1 ? 'ring-2 ring-gold-400' : ''}`}
                >
                  {i === 1 && (
                    <span className="badge mb-2 self-start bg-gold-100 text-gold-700">Most popular</span>
                  )}
                  <h3 className="font-display text-2xl font-bold text-slate-900">{p.name}</h3>
                  <p className="mt-2 text-3xl font-extrabold text-brand-700">
                    {formatCurrency(p.price, p.currency)}
                  </p>
                  {p.durationLabel && (
                    <p className="mt-1 text-sm text-slate-500">{p.durationLabel}</p>
                  )}
                  {p.description && <p className="mt-3 text-sm text-slate-600">{p.description}</p>}
                  <ul className="mt-4 space-y-2 text-sm text-slate-700">
                    {(p.features || []).map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <span className="mt-0.5 text-gold-500">✓</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link to="/book" className="btn-primary mt-6 w-full">
                    Book {p.name}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CTA / contact */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="card flex flex-col items-center gap-4 bg-gradient-to-br from-brand-50 to-gold-50 text-center">
          <h2 className="font-display text-3xl font-bold text-slate-900">Ready to book your date?</h2>
          <p className="max-w-xl text-slate-600">
            Reach out and our team will set up your account and guide you through the simple booking
            process.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {wa && (
              <a href={wa} target="_blank" rel="noreferrer" className="btn-gold px-6 py-3">
                Chat on WhatsApp
              </a>
            )}
            <Link to="/book" className="btn-primary px-6 py-3">
              See packages
            </Link>
          </div>
          {(settings.contactPhone || settings.contactEmail) && (
            <p className="text-sm text-slate-500">
              {settings.contactPhone && <span>Call: {settings.contactPhone}</span>}
              {settings.contactPhone && settings.contactEmail && <span> · </span>}
              {settings.contactEmail && <span>Email: {settings.contactEmail}</span>}
            </p>
          )}
        </div>
      </section>
    </div>
    </>
  );
}
