import type * as React from "react";

// React 19's automatic JSX runtime resolves IntrinsicElements from React's own
// JSX namespace, not the ambient global one, so augment it here.
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "week-schedule": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}
