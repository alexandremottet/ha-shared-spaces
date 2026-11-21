import type * as React from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      [tag: `${string}-${string}`]: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        [attr: string]: unknown;
      };
    }
  }
}
