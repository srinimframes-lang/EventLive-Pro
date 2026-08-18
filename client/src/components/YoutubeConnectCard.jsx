import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { youtubeService } from '../services/youtube.service.js';

const YOUTUBE_QUERY_MESSAGES = {
  connected: { tone: 'ok', text: 'YouTube connected successfully.' },
  denied: { tone: 'warn', text: 'YouTube connection was cancelled.' },
  expired: { tone: 'warn', text: 'YouTube connection expired. Please try again.' },
  invalid: { tone: 'err', text: 'YouTube connection could not be verified. Please try again.' },
  error: { tone: 'err', text: 'Could not connect YouTube. Please try again.' },
  google: { tone: 'err', text: 'Google returned an error. Please try again.' },
};

export default function YoutubeConnectCard({
  returnTo = '/dashboard',
  title = 'YouTube Integration',
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [status, setStatus] = useState({ connected: false, channelId: '', channelTitle: '' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState('');

  const load = () => {
    setLoading(true);
    youtubeService
      .status()
      .then((data) =>
        setStatus({
          connected: Boolean(data?.connected),
          channelId: data?.channelId || '',
          channelTitle: data?.channelTitle || '',
        })
      )
      .catch((err) => {
        setTone('err');
        setMessage(err.message || 'Could not load YouTube status.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const flag = params.get('youtube');
    if (!flag) return undefined;
    const info = YOUTUBE_QUERY_MESSAGES[flag];
    if (info) {
      setTone(info.tone);
      setMessage(info.text);
    }
    params.delete('youtube');
    const next = `${location.pathname}${params.toString() ? `?${params}` : ''}`;
    navigate(next, { replace: true });
    if (flag === 'connected') load();
    return undefined;
  }, [location.search, location.pathname, navigate]);

  const connect = async () => {
    setBusy(true);
    setMessage('');
    try {
      const data = await youtubeService.start(returnTo);
      if (!data?.authUrl) throw new Error('Could not start YouTube connection.');
      window.location.assign(data.authUrl);
    } catch (err) {
      setTone('err');
      setMessage(err.message || 'Could not start YouTube connection.');
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm('Disconnect this YouTube account from EventLivePro?')) return;
    setBusy(true);
    setMessage('');
    try {
      await youtubeService.disconnect();
      setStatus({ connected: false, channelId: '', channelTitle: '' });
      setTone('ok');
      setMessage('YouTube disconnected.');
    } catch (err) {
      setTone('err');
      setMessage(err.message || 'Could not disconnect YouTube.');
    } finally {
      setBusy(false);
    }
  };

  const banner =
    tone === 'ok'
      ? 'bg-green-50 text-green-800'
      : tone === 'warn'
        ? 'bg-amber-50 text-amber-800'
        : 'bg-red-50 text-red-700';

  return (
    <div className="card w-full" id="youtube-connect">
      <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-600">
        Connect your YouTube channel to EventLivePro. You can still paste a YouTube Live URL when
        creating a live link.
      </p>

      {message && (
        <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${banner}`}>{message}</p>
      )}

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Checking YouTube connection…</p>
      ) : status.connected ? (
        <div className="mt-4">
          <p className="text-sm font-semibold text-emerald-700">YouTube Connected</p>
          {status.channelTitle ? (
            <p className="mt-1 break-words text-sm text-slate-700">
              Channel: <span className="font-medium">{status.channelTitle}</span>
            </p>
          ) : null}
          <button
            type="button"
            className="btn-outline mt-4 w-full sm:w-auto"
            disabled={busy}
            onClick={disconnect}
          >
            {busy ? 'Working…' : 'Disconnect YouTube'}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn-primary mt-4 w-full sm:w-auto"
          disabled={busy}
          onClick={connect}
        >
          {busy ? 'Redirecting…' : 'Connect YouTube'}
        </button>
      )}
    </div>
  );
}
