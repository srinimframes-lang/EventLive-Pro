import { Component } from 'react';
import { Link } from 'react-router-dom';

/**
 * Catches render errors so users see a recovery UI instead of a blank page.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (error) {
      const message = error?.message || 'Something went wrong';
      return (
        <div className="mx-auto max-w-lg px-4 py-16 text-center">
          <h1 className="text-xl font-bold text-slate-900">Page could not load</h1>
          <p className="mt-2 text-sm text-slate-600">
            {message}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              className="btn-primary"
              onClick={() => this.setState({ error: null })}
            >
              Try again
            </button>
            <Link to="/events" className="btn-ghost">
              Back to events
            </Link>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
