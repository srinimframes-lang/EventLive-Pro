import { Link } from 'react-router-dom';

const features = [
  { title: 'Create events', desc: 'Spin up an event page in minutes with schedules, speakers and tickets.' },
  { title: 'Stream live', desc: 'Broadcast HD video to your audience with low-latency live streaming.' },
  { title: 'Engage & analyse', desc: 'Real-time chat, Q&A and analytics to understand your audience.' },
];

export default function Home() {
  return (
    <div className="mx-auto max-w-6xl px-4">
      <section className="grid items-center gap-10 py-16 md:grid-cols-2 md:py-24">
        <div>
          <span className="inline-block rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-700">
            MERN • JWT • Tailwind
          </span>
          <h1 className="mt-4 text-4xl font-extrabold leading-tight text-slate-900 sm:text-5xl">
            Host & stream <span className="text-brand-600">live events</span> that people remember.
          </h1>
          <p className="mt-4 text-lg text-slate-600">
            EventLive Pro is your all-in-one platform to plan, manage and broadcast events to a global audience.
          </p>
          <div className="mt-8 flex gap-3">
            <Link to="/register" className="btn-primary px-6 py-3 text-base">
              Get started free
            </Link>
            <Link to="/login" className="btn-ghost px-6 py-3 text-base">
              I have an account
            </Link>
          </div>
        </div>
        <div className="card bg-gradient-to-br from-brand-600 to-brand-800 text-white">
          <p className="text-sm uppercase tracking-wider text-brand-100">Live now</p>
          <p className="mt-2 text-2xl font-bold">Global Dev Summit 2026</p>
          <p className="mt-1 text-brand-100">12,480 watching</p>
          <div className="mt-6 aspect-video rounded-xl bg-black/30 ring-1 ring-white/20" />
        </div>
      </section>

      <section className="grid gap-6 pb-20 md:grid-cols-3">
        {features.map((f) => (
          <div key={f.title} className="card">
            <h3 className="text-lg font-bold text-slate-900">{f.title}</h3>
            <p className="mt-2 text-slate-600">{f.desc}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
