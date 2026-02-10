'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface NotesEditorProps {
  isOpen: boolean;
  taskTitle: string;
  editorTitle?: string;
  initialNotes: string;
  onSave: (notes: string) => Promise<void>;
  onClose: () => void;
}

export function NotesEditor({
  isOpen,
  taskTitle,
  editorTitle,
  initialNotes,
  onSave,
  onClose
}: NotesEditorProps) {
  const [notes, setNotes] = useState(initialNotes);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [mounted, setMounted] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Mount check for SSR
  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset notes when opened with new initial value
  useEffect(() => {
    if (isOpen) {
      setNotes(initialNotes);
      setHasChanges(false);
    }
  }, [isOpen, initialNotes]);

  // Focus textarea when opened
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      // Small delay to allow animation
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // Track changes
  useEffect(() => {
    setHasChanges(notes !== initialNotes);
  }, [notes, initialNotes]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, hasChanges]);

  const handleCancel = () => {
    if (hasChanges) {
      // Could add a confirmation dialog here
      setNotes(initialNotes);
    }
    onClose();
  };

  const handleSave = async () => {
    if (!hasChanges) {
      onClose();
      return;
    }

    setIsSaving(true);
    try {
      await onSave(notes);
      onClose();
    } catch (error) {
      console.error('Failed to save notes:', error);
      // Keep editor open on error
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 flex flex-col"
      style={{
        zIndex: 60,
        background: 'var(--bg-deep)',
        animation: 'slideUp 0.25s ease-out'
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-glass)',
          backdropFilter: 'blur(10px)'
        }}
      >
        <button
          onClick={handleCancel}
          disabled={isSaving}
          className="px-3 py-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors disabled:opacity-50"
        >
          {hasChanges ? 'Cancel' : 'Close'}
        </button>

        <h2
          className="text-sm font-medium text-[var(--text-primary)] truncate max-w-[180px]"
          title={editorTitle || taskTitle}
        >
          {editorTitle || taskTitle}
        </h2>

        <button
          onClick={handleSave}
          disabled={isSaving}
          className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
            isSaving
              ? 'text-[var(--text-muted)] opacity-50'
              : hasChanges
                ? 'text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/10'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          {isSaving ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Saving
            </span>
          ) : hasChanges ? (
            'Save'
          ) : (
            'Done'
          )}
        </button>
      </div>

      {/* Editor */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <textarea
          ref={textareaRef}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={editorTitle ? `Add ${editorTitle.toLowerCase()}...` : 'Add notes...'}
          disabled={isSaving}
          className="flex-1 p-4 bg-transparent text-[var(--text-primary)] text-base leading-relaxed resize-none focus:outline-none disabled:opacity-50"
          style={{
            minHeight: '200px'
          }}
        />

        {/* Footer with character count */}
        <div
          className="px-4 py-2 flex items-center justify-between text-xs text-[var(--text-muted)]"
          style={{
            borderTop: '1px solid rgba(255, 255, 255, 0.05)'
          }}
        >
          <span>
            {hasChanges && (
              <span className="text-[var(--accent-cyan)]">Unsaved changes</span>
            )}
          </span>
          <span>{notes.length} characters</span>
        </div>
      </div>

      <style jsx global>{`
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>,
    document.body
  );
}
