'use client';

import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Send } from 'lucide-react';
import { cn } from '@/lib/utils';

type CommentComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  placeholder?: string;
  submitting?: boolean;
  autoFocus?: boolean;
  className?: string;
  compact?: boolean;
};

export function CommentComposer({
  value,
  onChange,
  onSubmit,
  onCancel,
  placeholder = 'Write a comment…',
  submitting = false,
  autoFocus = false,
  className,
  compact = false,
}: CommentComposerProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
    }
  }, [autoFocus]);

  const canSubmit = Boolean(value.trim()) && !submitting;

  return (
    <div className={cn('flex gap-2 items-center', className)}>
      <div
        className={cn(
          'rounded-full bg-primary/10 text-primary border border-primary/20 shrink-0 flex items-center justify-center font-bold',
          compact ? 'h-6 w-6 text-[10px]' : 'h-8 w-8 text-xs',
        )}
        aria-hidden
      >
        ✦
      </div>
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={submitting}
        className={cn(
          'flex-1 text-xs bg-muted/20 border-border/80 rounded-full',
          compact ? 'h-8' : 'h-9',
        )}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (canSubmit) onSubmit();
          }
          if (e.key === 'Escape' && onCancel) {
            onCancel();
          }
        }}
      />
      {onCancel && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={submitting}
          className="h-8 px-2 text-[11px] text-muted-foreground shrink-0"
        >
          Cancel
        </Button>
      )}
      <Button
        type="button"
        size="sm"
        disabled={!canSubmit}
        onClick={onSubmit}
        className={cn('shrink-0 rounded-full px-3', compact ? 'h-8' : 'h-9')}
        aria-label="Send"
      >
        {submitting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Send className="h-3.5 w-3.5" />
        )}
      </Button>
    </div>
  );
}
