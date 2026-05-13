import type { ReactNode } from 'react'
import React from 'react'

import Text from './Text.js'
export type Props = {
  readonly children?: ReactNode
  readonly url: string
  readonly fallback?: ReactNode
}

export default function Link({ children, url, fallback }: Props): React.ReactNode {
  // Always emit <ink-link>: the renderer stores `hyperlink` per cell in the
  // screen buffer, which the click dispatcher (Ink.getHyperlinkAt →
  // onHyperlinkClick) reads on mouseup to open URLs externally. Gating this
  // on supportsHyperlinks() broke clicks in Apple Terminal / any terminal
  // not on the OSC 8 allowlist — the cell's hyperlink field stayed empty,
  // so the click pipeline had nothing to open. Whether the terminal natively
  // renders OSC 8 is a separate concern handled inside render-node-to-output:
  // it only emits the escape when supportsHyperlinks() agrees.
  const content = children ?? url

  return (
    <Text>
      <ink-link href={url}>{content}</ink-link>
    </Text>
  )
}

// Kept for API stability — `fallback` was the non-supporting-terminal
// rendering, now unused since we always emit the hyperlink metadata.
void (null as unknown as Props['fallback'])
