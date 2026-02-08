'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { ChatMessage, ResearchingIndicator } from '@/components/ChatMessage';
import { ChatInput } from '@/components/ChatInput';
import { askResearchAgent, clearChat, saveResearchResult } from '@/lib/api';
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
  // For saving context
  question?: string;
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
        question: text, // Store the original question for saving
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

  // Save a message to Notion
  const handleSaveMessage = useCallback(async (
    message: Message,
    category: 'Idea' | 'Admin'
  ) => {
    if (!message.question) return;

    await saveResearchResult({
      question: message.question,
      answer: message.content,
      category,
      citations: message.citations?.map(c => ({
        title: c.title,
        type: c.type,
        url: c.url,
        database: c.database,
      })),
      expertDomain: message.expertDomain,
    });
  }, []);

  return (
    <div className="mx-auto flex h-[calc(100dvh-80px)] max-w-lg flex-col">
      {/* Header - zen styling */}
      <header className="flex items-center justify-between px-5 pt-6 pb-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Ask</h1>
          <p className="text-xs text-[var(--text-muted)]/60">Research your knowledge</p>
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
          // Empty state - zen styling, centered
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="text-sm text-[var(--text-muted)]/60 mb-6">
              Ask anything about your knowledge
            </p>

            {/* Example prompts - subtle, centered */}
            <div className="space-y-2 w-full max-w-xs mx-auto">
              {[
                'What should I focus on today?',
                'Compare my active projects',
                'Who should I reconnect with?',
                'Recent business ideas',
              ].map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handleSend(prompt)}
                  className="block w-full rounded-lg px-4 py-2.5 text-center text-sm text-[var(--text-muted)]/70 transition-colors hover:text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]/30"
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
                question={message.question}
                onSave={message.role === 'assistant' && message.question
                  ? (category) => handleSaveMessage(message, category)
                  : undefined
                }
              />
            ))}
            {isLoading && <ResearchingIndicator status={researchStatus} />}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-deep)] px-5 py-4">
        <ChatInput onSend={handleSend} isLoading={isLoading} />
      </div>
    </div>
  );
}
