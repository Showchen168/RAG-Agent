import React from 'react'

export default function MockReactMarkdown({ children, className }: any) {
  return (
    <div className={className} data-testid="markdown-renderer">
      {children}
    </div>
  )
}
