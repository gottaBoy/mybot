import {
  ChatLayout,
  ChatMessage,
  ChatMessageBubble,
  ChatMessageList,
} from '@astryxdesign/core/Chat'
import { Avatar } from '@astryxdesign/core/Avatar'
import type { ReactNode } from 'react'
import { AppMarkdown } from './Markdown'

export type TranscriptItem = {
  id: string
  sender: 'user' | 'assistant'
  title: string
  content: string
  metadata?: ReactNode
}
export function AppTranscript({ items }: { items: TranscriptItem[] }) {
  return (
    <ChatLayout density="compact" composer={null}>
      <ChatMessageList align="top">
        {items.map((item) => (
          <ChatMessage
            key={item.id}
            sender={item.sender}
            avatar={
              item.sender === 'assistant' ? (
                <Avatar name={item.title} size="md" />
              ) : undefined
            }
          >
            <ChatMessageBubble
              variant={item.sender === 'user' ? 'filled' : 'ghost'}
            >
              <div className="wb-transcript-meta">
                <strong>{item.title}</strong>
                {item.metadata}
              </div>
              <AppMarkdown>{item.content}</AppMarkdown>
            </ChatMessageBubble>
          </ChatMessage>
        ))}
      </ChatMessageList>
    </ChatLayout>
  )
}
