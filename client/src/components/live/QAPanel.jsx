import { useState } from 'react';

function QuestionItem({ question, onUpvote, canAnswer, onAnswer }) {
  const [answering, setAnswering] = useState(false);
  const [answer, setAnswer] = useState('');

  const submitAnswer = (e) => {
    e.preventDefault();
    const body = answer.trim();
    if (!body) return;
    onAnswer(question.id, body);
    setAnswer('');
    setAnswering(false);
  };

  return (
    <li className={`rounded-xl border p-3 ${question.isAnswered ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-slate-800">{question.text}</p>
          <p className="mt-1 text-xs text-slate-400">— {question.name}</p>
        </div>
        <button
          type="button"
          onClick={() => onUpvote(question.id)}
          className="flex shrink-0 flex-col items-center rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:border-brand-300 hover:text-brand-700"
          title="Upvote"
        >
          ▲
          <span>{question.upvotes}</span>
        </button>
      </div>

      {question.isAnswered && question.answer && (
        <div className="mt-2 rounded-lg bg-white p-2 text-sm text-slate-700 ring-1 ring-emerald-100">
          <span className="font-semibold text-emerald-700">Answer: </span>
          {question.answer}
        </div>
      )}

      {canAnswer && !question.isAnswered && (
        answering ? (
          <form onSubmit={submitAnswer} className="mt-2 flex gap-2">
            <input
              className="input"
              placeholder="Type an answer…"
              value={answer}
              autoFocus
              onChange={(e) => setAnswer(e.target.value)}
            />
            <button type="submit" className="btn-primary">Reply</button>
          </form>
        ) : (
          <button
            type="button"
            className="mt-2 text-xs font-semibold text-brand-600 hover:underline"
            onClick={() => setAnswering(true)}
          >
            Answer
          </button>
        )
      )}
    </li>
  );
}

export default function QAPanel({ questions, onAsk, onUpvote, onAnswer, canAnswer, disabled }) {
  const [text, setText] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    onAsk(body);
    setText('');
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 px-4 py-3">
        <h3 className="font-bold text-slate-900">Q&amp;A</h3>
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 border-b border-slate-200 p-3">
        <input
          className="input"
          placeholder={disabled ? 'Connecting…' : 'Ask a question'}
          value={text}
          maxLength={500}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="btn-primary" disabled={disabled || !text.trim()}>
          Ask
        </button>
      </form>

      <ul className="flex-1 space-y-2 overflow-y-auto p-3">
        {questions.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">
            No questions yet. Be the first to ask!
          </p>
        ) : (
          questions.map((q) => (
            <QuestionItem
              key={q.id || q._id}
              question={q}
              onUpvote={onUpvote}
              onAnswer={onAnswer}
              canAnswer={canAnswer}
            />
          ))
        )}
      </ul>
    </div>
  );
}
