import { ThemeLayoutRouter } from '../theme/ThemeLayoutShell.jsx';

const SAMPLE_PHOTOS = [
  { id: 'p1', url: 'https://images.unsplash.com/photo-1519741497674-05eec4c9a3e0?w=400&q=70', caption: 'Ceremony' },
  { id: 'p2', url: 'https://images.unsplash.com/photo-1465496919957-b1cf01e17bb7?w=400&q=70', caption: 'Couple' },
  { id: 'p3', url: 'https://images.unsplash.com/photo-1605647543714-5c303122aec9?w=400&q=70', caption: 'Celebration' },
];

/** Full-page theme preview — uses the same layout components as the live watch page. */
export default function ThemePreviewModal({ theme, onClose, onApply }) {
  const snap = theme?.themeSnapshot || theme;
  const previewEvent = {
    id: 'preview',
    title: 'Sample Wedding Live',
    brideName: 'Priya',
    groomName: 'Aarav',
    startTime: new Date().toISOString(),
    venue: 'Grand Ballroom, Mumbai',
    description: 'Join us for a beautiful celebration of love and tradition.',
    gallery: SAMPLE_PHOTOS,
    coverImage: '',
    themeSnapshot: snap,
    chatEnabled: true,
  };

  const mockRoom = {
    viewers: 128,
    connected: true,
    messages: [],
    questions: [],
    sendMessage: () => {},
    askQuestion: () => {},
    upvoteQuestion: () => {},
    answerQuestion: () => {},
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/70" role="dialog" aria-modal="true">
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 bg-slate-900 px-4 py-3 text-white">
        <h3 className="font-bold">Preview — {snap.name}</h3>
        <div className="flex items-center gap-2">
          {onApply && (
            <button type="button" className="btn-primary px-4 py-1.5 text-sm" onClick={onApply}>
              Use Theme
            </button>
          )}
          <button type="button" className="btn-ghost px-3 text-white hover:bg-white/10" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ThemeLayoutRouter
          event={previewEvent}
          coupleTitle="Aarav & Priya"
          watchUrl="https://eventlivepro.com/live/preview"
          mergedConfig={{ provider: 'youtube', youtubeVideoId: 'M7lc1UVf-VE', isLive: true }}
          room={mockRoom}
          chatOn
          activeTab="chat"
          setTab={() => {}}
          canAnswer={false}
          playerNonce={0}
        />
      </div>
    </div>
  );
}
