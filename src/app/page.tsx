'use client';

import { useState, useCallback, useRef } from 'react';
import { CaptureInput } from '@/components/CaptureInput';
import { ConfirmCard } from '@/components/ConfirmCard';
import { AgentResponseCard, AgentTypingIndicator } from '@/components/AgentResponseCard';
import { captureThought, recategorize, askAgent } from '@/lib/api';
import type { Category, ConfirmationState, AgentResponse } from '@/lib/types';

export default function CapturePage() {
  const [isLoading, setIsLoading] = useState(false);
  const [isAgentLoading, setIsAgentLoading] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);
  const [agentResponse, setAgentResponse] = useState<AgentResponse | null>(null);
  const [lastText, setLastText] = useState('');

  // Session ID for agent memory - persists across follow-ups
  const sessionIdRef = useRef(`pwa-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleCapture = useCallback(async (text: string) => {
    setIsLoading(true);
    setLastText(text);
    // Clear agent response when capturing a new thought
    setAgentResponse(null);

    try {
      const response = await captureThought(text);

      if (response.status === 'captured' && response.category) {
        setConfirmation({
          show: true,
          text,
          category: response.category,
          confidence: response.confidence || 0,
          page_id: response.page_id,
        });
      } else if (response.status === 'needs_clarification') {
        setConfirmation({
          show: true,
          text,
          category: response.category || 'Admin',
          confidence: response.confidence || 0,
          page_id: response.page_id,
        });
      } else if (response.status === 'error') {
        console.error('Capture error:', response.error);
      }
    } catch (error) {
      console.error('Capture failed:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleAskAgent = useCallback(async (text: string) => {
    console.log('[Agent] Starting ask:', text);
    setIsAgentLoading(true);
    // Clear capture confirmation when asking the agent
    setConfirmation(null);
    setAgentResponse(null);

    try {
      console.log('[Agent] Calling API with session:', sessionIdRef.current);
      const response = await askAgent(text, sessionIdRef.current);
      console.log('[Agent] Response:', response);

      if (response.status === 'success') {
        setAgentResponse(response);
      } else {
        // Show error response
        setAgentResponse({
          status: 'error',
          response: response.error || 'Something went wrong. Please try again.',
          tools_used: [],
        });
      }
    } catch (error) {
      console.error('Agent error:', error);
      setAgentResponse({
        status: 'error',
        response: 'Failed to reach your second brain. Please check your connection.',
        tools_used: [],
      });
    } finally {
      setIsAgentLoading(false);
    }
  }, []);

  const handleRecategorize = useCallback(
    async (newCategory: Category | 'Ignore') => {
      if (!confirmation) return;

      if (newCategory === 'Ignore') {
        setConfirmation(null);
        return;
      }

      if (confirmation.page_id) {
        await recategorize(
          confirmation.page_id,
          confirmation.category,
          newCategory,
          lastText
        );
      }

      setConfirmation(null);
    },
    [confirmation, lastText]
  );

  const handleDismiss = useCallback(() => {
    setConfirmation(null);
  }, []);

  const handleAgentDismiss = useCallback(() => {
    setAgentResponse(null);
  }, []);

  const handleFollowUp = useCallback(() => {
    // Focus on the input for follow-up question
    // The user can then type their follow-up
    setAgentResponse(null);
    // Small delay to let the state update before focusing
    setTimeout(() => {
      const textarea = document.querySelector('textarea');
      if (textarea) {
        textarea.focus();
      }
    }, 100);
  }, []);

  return (
    <div className="mx-auto max-w-lg px-5 pt-12">
      {/* Header */}
      <header className="mb-10 animate-fade-up">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--accent-cyan)] to-[var(--accent-purple)] text-lg">
            🧠
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)]">
            Second Brain
          </h1>
        </div>
        <p className="text-base text-[var(--text-muted)] ml-[52px]">
          Capture thoughts. Ask questions. Let AI help.
        </p>
      </header>

      {/* Capture Input */}
      <div className="mb-8 animate-fade-up delay-1" style={{ opacity: 0 }}>
        <CaptureInput
          onSubmit={handleCapture}
          onAskAgent={handleAskAgent}
          isLoading={isLoading}
          isAgentLoading={isAgentLoading}
        />
      </div>

      {/* Agent Loading Indicator */}
      {isAgentLoading && (
        <div className="mb-8">
          <AgentTypingIndicator />
        </div>
      )}

      {/* Agent Response Card */}
      {agentResponse && !isAgentLoading && (
        <div className="mb-8">
          <AgentResponseCard
            response={agentResponse.response}
            toolsUsed={agentResponse.tools_used}
            onFollowUp={handleFollowUp}
            onDismiss={handleAgentDismiss}
            autoDismiss={30000}
          />
        </div>
      )}

      {/* Confirmation Card */}
      {confirmation?.show && !agentResponse && (
        <div className="mb-8">
          <ConfirmCard
            text={confirmation.text}
            category={confirmation.category}
            confidence={confirmation.confidence}
            pageId={confirmation.page_id}
            onRecategorize={handleRecategorize}
            onDismiss={handleDismiss}
            autoDismiss={5000}
          />
        </div>
      )}

      {/* Quick tips card - hide when there's a response visible */}
      {!confirmation?.show && !agentResponse && !isAgentLoading && (
        <div className="animate-fade-up delay-2 glass-card p-5" style={{ opacity: 0 }}>
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-[var(--text-primary)]">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--accent-cyan-dim)] text-xs">
              💡
            </span>
            Try These
          </h2>
          <div className="space-y-3">
            {[
              { text: 'What tasks do I have?', type: 'Ask', color: 'text-purple-400' },
              { text: 'Follow up with Sarah next week', type: 'Capture', color: 'text-blue-400' },
              { text: 'Show me my projects', type: 'Ask', color: 'text-purple-400' },
              { text: 'Pay electricity bill by Friday', type: 'Capture', color: 'text-orange-400' },
            ].map((example, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg bg-[var(--bg-elevated)] px-3 py-2"
              >
                <span className="text-sm text-[var(--text-secondary)]">&ldquo;{example.text}&rdquo;</span>
                <span className={`text-xs font-medium ${example.color}`}>{example.type}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
