'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { ChatMessage, ResearchingIndicator } from '@/components/ChatMessage';
import { ChatInput } from '@/components/ChatInput';
import { askResearchAgent, clearChat } from '@/lib/api';
import type { ResearchCitation, ResearchStep } from '@/lib/types';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolsUsed?: string[];
  // Research-specific fields
  citations?: ResearchCitation[];
  researchSteps?: ResearchStep[];
  expertDomain?: string;
  iterations?: number;
}

export default function AskPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [researchStatus, setResearchStatus] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef(`research-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSend = useCallback(async (text: string) => {
    // Add user message
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    setResearchStatus('Analyzing your question...');

    try {
      const response = await askResearchAgent(text, sessionIdRef.current);

      // Add assistant message with research data
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response.status === 'success'
          ? response.response
          : response.error || 'Something went wrong. Please try again.',
        toolsUsed: response.tools_used,
        citations: response.citations,
        researchSteps: response.research_steps,
        expertDomain: response.expert_domain,
        iterations: response.iterations,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: 'Failed to reach your second brain. Please check your connection.',
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setResearchStatus('');
    }
  }, []);

  const handleNewChat = useCallback(async () => {
    // Clear from backend
    await clearChat(sessionIdRef.current);
    // Reset local state
    setMessages([]);
    sessionIdRef.current = `research-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }, []);

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-5 pt-6 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#a855f7]/20 to-[#6366f1]/20 text-xl">
            <svg className="h-5 w-5 text-[#a855f7]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[var(--text-primary)]">Ask Your Brain</h1>
            <p className="text-xs text-[var(--text-muted)]">Research Agent</p>
          </div>
        </div>

        {messages.length > 0 && (
          <button
            onClick={handleNewChat}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            New chat
          </button>
        )}
      </header>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-5 pb-4">
        {messages.length === 0 ? (
          // Empty state
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#a855f7]/10 to-[#6366f1]/10">
              <svg className="h-8 w-8 text-[#a855f7]/60" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" />
              </svg>
            </div>
            <p className="mb-2 text-lg font-medium text-[var(--text-primary)]">
              Research Agent Ready
            </p>
            <p className="max-w-[300px] text-sm text-[var(--text-muted)]">
              I&apos;ll search your Second Brain and the web, then answer with verified sources.
            </p>

            {/* Example prompts */}
            <div className="mt-6 space-y-2">
              {[
                'What do you think about learning n8n?',
                'Compare my active projects by priority',
                'Who should I reconnect with this week?',
                'What business ideas have I captured recently?',
              ].map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handleSend(prompt)}
                  className="block w-full rounded-xl bg-[var(--bg-elevated)] px-4 py-2.5 text-left text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-surface)]"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          // Messages list
          <div className="space-y-4">
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                role={message.role}
                content={message.content}
                toolsUsed={message.toolsUsed}
                citations={message.citations}
                researchSteps={message.researchSteps}
                expertDomain={message.expertDomain}
              />
            ))}
            {isLoading && <ResearchingIndicator status={researchStatus} />}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-deep)] px-5 py-4 safe-bottom">
        <ChatInput onSend={handleSend} isLoading={isLoading} />
      </div>
    </div>
  );
}
