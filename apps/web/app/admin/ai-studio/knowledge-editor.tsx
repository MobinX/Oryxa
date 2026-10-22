'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  createAdminKnowledge,
  deleteAdminKnowledge,
  listAdminKnowledge,
  updateAdminKnowledge,
  type AdminKnowledgeEntry,
} from '@/lib/api';

export function KnowledgeEditor({
  bearer,
  businessId,
  entries,
}: {
  bearer: string;
  businessId: string;
  entries: AdminKnowledgeEntry[];
}) {
  const [items, setItems] = useState(entries);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!question.trim() || !answer.trim()) return;
    setBusy(true);
    try {
      await createAdminKnowledge(bearer, businessId, { question: question.trim(), answer: answer.trim() });
      setQuestion('');
      setAnswer('');
      setItems((await listAdminKnowledge(bearer, businessId)).entries);
      setStatus('Saved.');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (entry: AdminKnowledgeEntry) => {
    setBusy(true);
    try {
      await updateAdminKnowledge(bearer, businessId, entry.id, { active: !entry.active });
      setItems((list) => list.map((row) => (row.id === entry.id ? { ...row, active: !row.active } : row)));
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Update failed.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (entry: AdminKnowledgeEntry) => {
    setBusy(true);
    try {
      await deleteAdminKnowledge(bearer, businessId, entry.id);
      setItems((list) => list.filter((row) => row.id !== entry.id));
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Delete failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="font-semibold">Knowledge / FAQ</h2>
        <p className="text-sm text-muted-foreground">
          Question-and-answer pairs the AI may quote. Inactive entries are kept but no longer
          offered to the model.
        </p>
      </div>

      <div className="space-y-2">
        <Textarea
          rows={2}
          placeholder="Question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <Textarea
          rows={3}
          placeholder="Answer (written exactly as it should be quoted)"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
        />
        <div className="flex items-center gap-3">
          <Button type="button" onClick={create} disabled={busy || !question.trim() || !answer.trim()}>
            {busy ? 'Working…' : 'Add entry'}
          </Button>
          {status && <span className="text-sm text-muted-foreground">{status}</span>}
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No FAQ entries yet.</p>
      ) : (
        <ul className="divide-y divide-border/40">
          {items.map((entry) => (
            <li key={entry.id} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={`font-medium ${entry.active ? '' : 'text-muted-foreground line-through'}`}>
                    {entry.question}
                  </p>
                  <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{entry.answer}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button variant="outline" size="sm" type="button" onClick={() => toggle(entry)} disabled={busy}>
                    {entry.active ? 'Disable' : 'Enable'}
                  </Button>
                  <Button variant="outline" size="sm" type="button" onClick={() => remove(entry)} disabled={busy}>
                    Delete
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
