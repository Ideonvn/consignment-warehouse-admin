"use client";

import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Keeps a render crash inside the content area — the operator keeps their
 * navigation and can get back to work without reloading.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("Console screen crashed", error);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div
        role="alert"
        className="flex flex-col items-start gap-3 rounded border border-danger bg-danger-tint px-4 py-4"
      >
        <div>
          <p className="text-sm font-semibold text-danger-ink">
            This screen stopped working
          </p>
          <p className="mt-1 text-sm text-danger-ink">
            {this.state.error.message}
          </p>
          <p className="mt-1 text-xs text-danger-ink">
            Nothing was sent to the backend by this failure. Auctions and bids
            are unaffected.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => this.setState({ error: null })}
        >
          Try again
        </Button>
      </div>
    );
  }
}
