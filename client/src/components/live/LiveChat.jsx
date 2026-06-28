import { useEffect, useRef, useState } from 'react';
import { formatDateTime } from '../../utils/format.js';

export default function LiveChat({ messages, onSend, disabled }) {
  const [text, setText] = useState('');
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    onSend(body);
    setText('');
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 px-4 py-3">
        <h3 className="font-bold text-slate-900">Live chat</h3>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">
            No messages yet. Say hello! 👋
          </p>
        ) : (
          messages.map((m) => (
            <div key={m.id || m._id} className="text-sm">
              <span className="font-semibold text-brand-700">{m.name}</span>
              <span className="ml-2 text-[10px] text-slate-400">
                {formatDateTime(m.createdAt)}
              </span>
              <p className="text-slate-700">{m.text}</p>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-slate-200 p-3">
        <input
          className="input"
          placeholder={disabled ? 'Connecting…' : 'Send a message'}
          value={text}
          maxLength={1000}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="btn-primary" disabled={disabled || !text.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
