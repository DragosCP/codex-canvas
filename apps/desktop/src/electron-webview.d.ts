import type { DetailedHTMLProps, HTMLAttributes } from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      webview: DetailedHTMLProps<
        HTMLAttributes<HTMLElement> & {
          allowpopups?: string;
          partition?: string;
          src?: string;
        },
        HTMLElement
      >;
    }
  }
}
