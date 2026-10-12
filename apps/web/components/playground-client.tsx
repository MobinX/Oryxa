'use client';

import { useState, useEffect, useRef } from 'react';
import {
  getDefaultAgent,
  updateAgent,
  listChannels,
  createChannel,
  listConversations,
  listMessages,
  deleteConversation,
  type Agent,
  type Channel,
} from '@/lib/api';
import {
  PLAYGROUND_CHAT_PAGE,
  sandboxPageId,
  type PlaygroundPreload,
} from '@/lib/playground-preload';
import {
  Terminal as TerminalIcon,
  Bot,
  MessageSquare,
  Plus,
  Trash2,
  Send,
  RefreshCw,
  Check,
  User,
  Shield,
  Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Predefined mock test customers
const MOCK_NAMES = [
  'Oliver Queen',
  'Bruce Wayne',
  'Diana Prince',
  'Barry Allen',
  'Clark Kent',
  'Kara Danvers',
  'Tony Stark',
  'Peter Parker',
  'Selina Kyle',
  'Arthur Curry',
];

/**
 * One line per earlier comment, oldest first. A line that starts with `page:` is the page's
 * own reply — which is how the agent sees an admin's manual answer too — and anything else
 * is another comment from this customer.
 */
function parseCommentHistory(text: string): { from: 'customer' | 'self'; content: string }[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 20)
    .map((line) => {
      const isPage = /^page:\s*/i.test(line);
      return {
        from: isPage ? ('self' as const) : ('customer' as const),
        content: line.replace(/^page:\s*/i, ''),
      };
    })
    .filter((row) => row.content.length > 0);
}

/**
 * What to store for one guidance box. The editor shows the built-in text whenever the store has
 * written none — so a box that still matches it, or one the admin emptied, is not custom wording
 * and goes back as null rather than freezing today's copy into the row.
 */
function ownWording(text: string, builtin: string | undefined): string | null {
  const value = text.trim();
  if (!value) return null;
  return value === (builtin ?? '').trim() ? null : value;
}

interface Conversation {
  id: string;
  customerName: string | null;
  customerPlatformId: string;
  lastMessageState: string;
  createdAt: string;
}

interface Message {
  id: string;
  from: string;
  content: string;
  time: string;
  /** Only the comment playground sets this: how the line should be labelled. */
  kind?: 'comment' | 'reply' | 'dm';
}

interface LogEvent {
  id: string;
  timestamp: string;
  event: string;
  data: any;
}

export function PlaygroundClient({
  token,
  businessId,
  preload,
  canEditPrompt = false,
}: {
  token: string;
  businessId: string;
  /**
   * The sandbox channel, its first page of chats and — on the console's copy of this page — the
   * agent row, all read during rendering so neither the chat list nor the prompt editors paint
   * blank while a browser call is still on its way.
   */
  preload?: PlaygroundPreload | null;
  /** Only the operator console passes this: the prompt and guidance editors exist for it alone. */
  canEditPrompt?: boolean;
}) {
  // State
  const [agent, setAgent] = useState<Agent | null>(preload?.agent ?? null);
  const [systemPrompt, setSystemPrompt] = useState<string>(preload?.agent?.systemPrompt ?? '');
  const [replyGuidance, setReplyGuidance] = useState<string>(preload?.agent?.replyGuidance ?? '');
  const [commentReplyGuidance, setCommentReplyGuidance] = useState<string>(
    preload?.agent?.commentReplyGuidance ?? '',
  );
  const [isUpdatingPrompt, setIsUpdatingPrompt] = useState(false);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(preload?.channel ?? null);

  const [conversations, setConversations] = useState<Conversation[]>(preload?.conversations ?? []);
  const [selectedConvId, setSelectedConvId] = useState<string>(preload?.conversations[0]?.id ?? '');
  const [messages, setMessages] = useState<Message[]>(preload?.messages ?? []);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [hasMoreChats, setHasMoreChats] = useState(
    (preload?.conversations.length ?? 0) >= PLAYGROUND_CHAT_PAGE,
  );
  const [isLoadingMoreChats, setIsLoadingMoreChats] = useState(false);

  const [inputMessage, setInputMessage] = useState('');
  /**
   * The run in flight, and the pane it streams into: a chat run belongs to the chat it was sent
   * from (`convId` is empty until the stream names a brand-new one), a comment run to the comment
   * thread. The waiting state follows that pane instead of the whole console, so a run cannot leave
   * the chat list, New Chat and every other thread looking frozen while it streams.
   */
  const [run, setRun] = useState<{ id: number; pane: 'chat' | 'comment'; convId: string } | null>(
    null,
  );
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [selectedLog, setSelectedLog] = useState<LogEvent | null>(null);

  // The comment playground: one made-up public comment, whatever came before it on the post,
  // and what the agent chose to do. Nothing here reaches Meta — both delivery routes come
  // back down the stream as events, which is the whole point of testing them.
  const [commenterName, setCommenterName] = useState('Ariana Rahman');
  const [historyText, setHistoryText] = useState('');
  const [commentText, setCommentText] = useState('');
  const [commentThread, setCommentThread] = useState<Message[]>([]);
  const [commentMode, setCommentMode] = useState(false);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatsEndRef = useRef<HTMLButtonElement>(null);
  const loadingMoreRef = useRef(false);
  /** Each run claims a number, so only the run still holding the pane is allowed to clear it. */
  const runIdRef = useRef(0);
  /** Chat reads are numbered the same way — a slow answer about an abandoned chat must not paint. */
  const loadSeqRef = useRef(0);
  /** Which chat is on screen right now, read by a run that is about to re-read its own thread. */
  const shownConvRef = useRef<string>(preload?.conversations[0]?.id ?? '');

  // Load Initial Data
  useEffect(() => {
    loadSandbox();
  }, []);

  // Reload conversations when the active channel changes
  useEffect(() => {
    if (activeChannel) {
      loadConversations();
    } else {
      setConversations([]);
      setSelectedConvId('');
      setMessages([]);
    }
  }, [activeChannel]);

  // Load messages when conversation selection changes
  useEffect(() => {
    if (selectedConvId) {
      loadMessages(selectedConvId);
    } else {
      setMessages([]);
    }
  }, [selectedConvId]);

  useEffect(() => {
    shownConvRef.current = selectedConvId;
  }, [selectedConvId]);

  // A run animates and blocks only the thread it is running in. A chat that is still being made
  // has no id yet, so until the stream names one its own pane is the one showing the wait.
  const chatRunning = run?.pane === 'chat' && (run.convId === '' || run.convId === selectedConvId);
  const commentRunning = run?.pane === 'comment';
  // The mock chat header reports whichever pane is on screen.
  const waitingHere = commentMode ? commentRunning : chatRunning;

  // The chat drawer is the only list that grows: reaching its end asks the API for the next page.
  useEffect(() => {
    if (!hasMoreChats) return;
    const node = chatsEndRef.current;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadMoreChats();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMoreChats, conversations.length]);

  // Scroll logs and chats to bottom on updates
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, run]);

  async function loadSandbox() {
    try {
      const [agentRow, channelList] = await Promise.all([
        getDefaultAgent(token, businessId),
        listChannels(token, businessId),
      ]);

      setAgent(agentRow);
      setSystemPrompt(agentRow.systemPrompt || '');
      setReplyGuidance(agentRow.replyGuidance ?? '');
      setCommentReplyGuidance(agentRow.commentReplyGuidance ?? '');

      // Test chats run on a sandbox page of their own, never on a Page that has customers on it.
      const pageId = sandboxPageId(businessId);
      let sandbox = channelList.find((c) => c.platformChannelId === pageId);
      if (!sandbox) {
        const seeded = await createChannel(token, businessId, {
          platform: 'facebook',
          apiToken: 'mock-test-token',
          platformChannelId: pageId,
          extraInfo: JSON.stringify({ pageName: 'Sandbox Testing Page' }),
        });
        const updated = await listChannels(token, businessId);
        sandbox = updated.find((c) => c.id === seeded.id);
      }

      if (sandbox) setActiveChannel((current) => (current?.id === sandbox.id ? current : sandbox));
    } catch (err) {
      console.error('Failed to load the playground sandbox:', err);
    }
  }

  async function loadConversations() {
    if (!activeChannel) return;
    try {
      const convList = await listConversations(token, businessId, {
        channelId: activeChannel.id,
        limit: PLAYGROUND_CHAT_PAGE,
      });
      // The API scopes these to the channel already; filtering here too means a page that arrives
      // from an API that has not caught up still cannot show another channel's real customers.
      const filtered = convList.filter((c) => c.channelId === activeChannel?.id);
      setConversations(filtered);
      setHasMoreChats(convList.length >= PLAYGROUND_CHAT_PAGE);
      if (filtered.length > 0 && !selectedConvId) {
        setSelectedConvId(filtered[0]!.id);
      }
    } catch (err) {
      console.error('Failed to load conversations:', err);
    }
  }

  /** The next page of chats, appended to what is already on screen. */
  async function loadMoreChats() {
    if (!activeChannel || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setIsLoadingMoreChats(true);
    try {
      const next = await listConversations(token, businessId, {
        channelId: activeChannel.id,
        limit: PLAYGROUND_CHAT_PAGE,
        offset: conversations.length,
      });
      const mine = next
        .filter((c) => c.channelId === activeChannel.id)
        .filter((c) => !conversations.some((held) => held.id === c.id));
      setConversations((prev) => [...prev, ...mine]);
      setHasMoreChats(next.length >= PLAYGROUND_CHAT_PAGE);
    } catch (err) {
      console.error('Failed to load the next page of chats:', err);
    } finally {
      loadingMoreRef.current = false;
      setIsLoadingMoreChats(false);
    }
  }

  async function loadMessages(convId: string) {
    const seq = ++loadSeqRef.current;
    setIsLoadingMessages(true);
    try {
      const msgList = await listMessages(token, businessId, convId);
      // Somebody tapped another chat while this read was on its way; its answer is not this pane's.
      if (seq !== loadSeqRef.current) return;
      setMessages(msgList || []);
    } catch (err) {
      if (seq === loadSeqRef.current) console.error('Failed to load messages:', err);
    } finally {
      if (seq === loadSeqRef.current) setIsLoadingMessages(false);
    }
  }

  /** Re-reads a chat only while it is still the one on screen — see `shownConvRef`. */
  async function refreshChat(convId: string) {
    if (convId && shownConvRef.current === convId) await loadMessages(convId);
  }

  /** Hands the run in flight to the chat the stream just named, unless a newer one already took it. */
  function claimChatRun(id: number, convId: string) {
    setRun((current) => (current?.id === id ? { ...current, convId } : current));
  }

  /** Only the run still holding the pane may release it; one that was replaced must leave it alone. */
  function endRun(id: number) {
    setRun((current) => (current?.id === id ? null : current));
  }

  async function handleSaveSystemPrompt() {
    if (!agent) return;
    setIsUpdatingPrompt(true);
    try {
      // A box still holding the built-in text (or emptied on purpose) writes null, so the store
      // keeps following Oryxa's wording as it evolves instead of pinning today's copy.
      const guidance = {
        replyGuidance: ownWording(replyGuidance, agent.guidanceDefaults?.replyGuidance),
        commentReplyGuidance: ownWording(commentReplyGuidance, agent.guidanceDefaults?.commentReplyGuidance),
      };
      await updateAgent(token, businessId, agent.id, { systemPrompt, ...guidance });
      setAgent({ ...agent, systemPrompt, ...guidance });
      // A box that resolved to null shows the built-in text again, not what was typed in it.
      setReplyGuidance(guidance.replyGuidance ?? '');
      setCommentReplyGuidance(guidance.commentReplyGuidance ?? '');
      addLog('system_prompt_updated', { systemPrompt, ...guidance });
    } catch (err) {
      console.error('Failed to update system prompt:', err);
    } finally {
      setIsUpdatingPrompt(false);
    }
  }

  async function handleCreateChat() {
    if (!activeChannel) return;
    const randomName = MOCK_NAMES[Math.floor(Math.random() * MOCK_NAMES.length)]!;
    const testUserId = `test-user-${Date.now()}`;

    // Create custom conversation by sending a seed hello message via the Hono receiver API
    // We send an SSE trigger message which creates the conversation
    const myRun = ++runIdRef.current;
    setRun({ id: myRun, pane: 'chat', convId: '' });
    setLogs([]);
    try {
      const response = await fetch('/api/playground/test-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId,
          channelId: activeChannel.id,
          userMessage: `Hello! I am ${randomName}.`,
          testUserId,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        alert(err.error || 'Failed to start chat');
        return;
      }

      let conversationId = '';
      await parseSseStream(response, (event, data) => {
        if (event === 'conversation_ready' && typeof data.conversationId === 'string') {
          conversationId = data.conversationId;
          claimChatRun(myRun, conversationId);
        }
      });
      await loadConversations();
      // Read the thread back once the run is over. `conversation_ready` selects it mid-stream, and
      // the messages fetched at that moment cannot include a reply the agent has not written yet —
      // without this the seeded chat would sit showing only its own hello.
      await refreshChat(conversationId);
    } catch (err) {
      console.error('Failed to seed conversation:', err);
    } finally {
      endRun(myRun);
    }
  }

  /** Switching chats empties the pane first, so the reader sees a load instead of the last chat. */
  function selectChat(convId: string) {
    if (convId === selectedConvId) return;
    setMessages([]);
    setSelectedConvId(convId);
  }

  async function handleDeleteChat(convId: string) {
    if (!confirm('Are you sure you want to hard delete this conversation? This will permanently wipe all messages from the database.')) return;
    try {
      await deleteConversation(token, businessId, convId);
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      if (selectedConvId === convId) {
        setSelectedConvId('');
        setMessages([]);
      }
      addLog('conversation_hard_deleted', { conversationId: convId });
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  }

  function addLog(event: string, data: any) {
    const newLog: LogEvent = {
      id: `${Date.now()}-${Math.random()}`,
      timestamp: new Date().toLocaleTimeString(),
      event,
      data,
    };
    setLogs((prev) => [...prev, newLog]);
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!inputMessage.trim() || !activeChannel || !selectedConvId) return;

    const userMessage = inputMessage.trim();
    const convId = selectedConvId;
    setInputMessage('');
    const myRun = ++runIdRef.current;
    setRun({ id: myRun, pane: 'chat', convId });
    setLogs([]); // Reset log panel for new run

    // Optimistically push customer message to the chat view
    const optimisticMsg: Message = {
      id: `temp-${Date.now()}`,
      from: 'customer',
      content: userMessage,
      time: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    const activeConv = conversations.find((c) => c.id === selectedConvId);
    const testUserId = activeConv?.customerPlatformId || `test-user-${selectedConvId}`;

    try {
      const response = await fetch('/api/playground/test-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId,
          channelId: activeChannel.id,
          userMessage,
          testUserId,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        alert(err.error || 'Failed to send message');
        return;
      }

      await parseSseStream(response);
      await refreshChat(convId);
    } catch (err) {
      console.error('Failed during agent test run stream:', err);
    } finally {
      endRun(myRun);
    }
  }

  /**
   * Runs the comment agent over the thread on screen. The thread is redrawn from the form on
   * every run, so the lines shown are exactly the lines the agent was given — and the reply
   * that arrives is drawn under whichever comment it answers.
   */
  async function handleRunComment(e: React.FormEvent) {
    e.preventDefault();
    const comment = commentText.trim();
    if (!comment || !activeChannel) return;

    const history = parseCommentHistory(historyText);
    const time = new Date().toISOString();
    setCommentThread([
      ...history.map((row, i) => ({
        id: `history-${i}`,
        from: row.from,
        content: row.content,
        time,
        kind: row.from === 'self' ? ('reply' as const) : ('comment' as const),
      })),
      { id: `current-${Date.now()}`, from: 'customer', content: comment, time, kind: 'comment' as const },
    ]);

    setCommentText('');
    const myRun = ++runIdRef.current;
    setRun({ id: myRun, pane: 'comment', convId: '' });
    setLogs([]);

    const append = (from: string, content: string, kind: Message['kind']) =>
      setCommentThread((prev) => [...prev, { id: `${kind}-${Date.now()}`, from, content, time: new Date().toISOString(), kind }]);

    try {
      const response = await fetch('/api/playground/comment-test-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId,
          channelId: activeChannel.id,
          comment,
          history,
          commenterName,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        append('self', err.error || 'Failed to run the comment agent', 'reply');
        return;
      }

      await parseSseStream(response, (event, data) => {
        // Only the two delivery choices are drawn as thread lines; everything else the agent
        // did (searching the catalog, tool results) belongs in the trace on the right.
        if (event === 'comment_replied' && data.text) append('self', data.text, 'reply');
        if (event === 'private_message_sent' && data.text) append('self', data.text, 'dm');
        if (event === 'no_reply') {
          append('self', data.silent ? 'Stayed silent — no comment reply, no Messenger message.' : `No tool called. Final text: ${data.text || '(empty)'}`, 'reply');
        }
        // The run stopped before it chose a door. Say so in the thread rather than leaving the
        // operator reading a comment with no answer and no trace of why.
        if (event === 'error') append('self', data.message || 'The comment agent did not run', 'reply');
      });
    } catch (err) {
      console.error('Failed during comment test run:', err);
      append('self', `Run failed: ${String(err)}`, 'reply');
    } finally {
      endRun(myRun);
    }
  }

  /**
   * Reads a run's SSE stream until it says it is finished. `done` and `error` are the last events
   * both playground routes write, so the read ends there and hangs up: waiting instead for the
   * connection to close leaves this promise pending — and with it the thread it belongs to — on a
   * stream a proxy may keep open long after the agent stopped writing.
   */
  async function parseSseStream(res: Response, onEvent?: (event: string, data: any) => void) {
    const reader = res.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent = '';
    let finished = false;

    while (!finished) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith('event: ')) {
          currentEvent = trimmed.slice(7).trim();
        } else if (trimmed.startsWith('data: ')) {
          const event = currentEvent;
          const rawData = trimmed.slice(6).trim();
          try {
            const data = JSON.parse(rawData);
            addLog(event, data);
            onEvent?.(event, data);

            // Auto-select conversation if it was created
            if (event === 'conversation_ready') {
              setSelectedConvId(data.conversationId);
            }
          } catch {
            // Raw text fallback
            addLog(event, { text: rawData });
            onEvent?.(event, { text: rawData });
          }
          currentEvent = ''; // Reset
          if (event === 'done' || event === 'error') finished = true;
        }
      }
    }

    if (finished) reader.cancel().catch(() => {});
  }

  return (
    <div className="flex h-full min-h-[calc(100vh-10rem)] flex-col gap-6 text-slate-100">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-950 p-6 shadow-xl border border-indigo-500/10">
        <div className="absolute -right-6 -bottom-6 h-36 w-36 rounded-full bg-indigo-500/10 blur-2xl" />
        <div className="absolute -left-6 -top-6 h-36 w-36 rounded-full bg-violet-500/10 blur-2xl" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-300">
                Agent Debugging Console
              </p>
            </div>
            <h1 className="font-geist text-2xl font-bold bg-gradient-to-r from-white via-slate-100 to-indigo-200 bg-clip-text text-transparent mt-1">
              Agent Playground
            </h1>
            <p className="text-xs text-slate-400 mt-1 max-w-xl">
              Play the mock customer — in the inbox, or under a post — and watch every tool call,
              result and reply stream in, including which door the comment agent chose.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={loadSandbox}
              className="flex items-center justify-center h-10 w-10 rounded-xl bg-slate-800/80 border border-slate-700/50 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
              title="Reload sandbox"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left Side: the assistant answering this store's pages (xl:col-span-4) */}
        <div className="xl:col-span-4 flex flex-col gap-6">
          {/* The prompt and the two wording blocks. Operator console only: a store sees its
              assistant answer with them, it does not write them. */}
          {canEditPrompt && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-xl">
              <div className="flex items-center gap-2 mb-4">
                <Bot className="h-5 w-5 text-indigo-400" />
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                  {agent?.name ?? 'Your Assistant'}
                </h2>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    System Prompt
                  </label>
                  <span className="text-[10px] font-medium text-slate-500">
                    Applies to the next test message
                  </span>
                </div>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  rows={10}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 p-4 text-xs font-mono text-slate-300 outline-none leading-relaxed resize-none focus:border-indigo-500"
                  placeholder="Your assistant's instructions..."
                />
              </div>

              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    Messenger reply guidance
                  </label>
                  <span className="text-[10px] font-medium text-slate-500">
                    {agent?.replyGuidance ? 'Store’s own wording' : 'Built-in wording'}
                  </span>
                </div>
                <textarea
                  value={replyGuidance || agent?.guidanceDefaults?.replyGuidance || ''}
                  onChange={(e) => setReplyGuidance(e.target.value)}
                  rows={8}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 p-4 text-xs font-mono text-slate-300 outline-none leading-relaxed resize-y focus:border-indigo-500"
                />
              </div>

              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    Comment reply guidance
                  </label>
                  <span className="text-[10px] font-medium text-slate-500">
                    {agent?.commentReplyGuidance ? 'Store’s own wording' : 'Built-in wording'}
                  </span>
                </div>
                <textarea
                  value={commentReplyGuidance || agent?.guidanceDefaults?.commentReplyGuidance || ''}
                  onChange={(e) => setCommentReplyGuidance(e.target.value)}
                  rows={8}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 p-4 text-xs font-mono text-slate-300 outline-none leading-relaxed resize-y focus:border-indigo-500"
                />
                <p className="text-[10px] leading-relaxed text-slate-500">
                  These two blocks are what the agent is told about <em>how</em> to answer — the
                  Messenger one for chats, the comment one for public threads and the comment
                  playground. Editing either applies to the next test run. Leave a box on the
                  built-in text, or empty it, to keep following Oryxa’s wording as it changes.
                </p>
              </div>

              <button
                onClick={handleSaveSystemPrompt}
                disabled={isUpdatingPrompt}
                className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl bg-indigo-600/10 border border-indigo-500/20 py-2.5 text-xs font-bold text-indigo-400 hover:bg-indigo-600/20 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {isUpdatingPrompt ? (
                  <>Saving...</>
                ) : (
                  <>
                    <Check className="h-4 w-4" /> Save prompt &amp; guidance
                  </>
                )}
              </button>
            </div>
          )}

          {/* Connected Channel Card */}
          {activeChannel && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400">
                  <Shield className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-bold text-slate-200">
                    {activeChannel.pageName || 'Sandbox Testing Page'}
                  </h4>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Platform: {activeChannel.platform} (Mocked Channel ID: {activeChannel.platformChannelId})
                  </p>
                </div>
                <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-400 border border-emerald-500/20">
                  Active
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Middle Panel: Test Chat Frame (xl:col-span-5) */}
        <div className="xl:col-span-5 flex flex-col gap-6">
          <div className="rounded-3xl border border-slate-800 bg-slate-950 shadow-2xl overflow-hidden flex flex-col h-[650px] relative">
            {/* Top Mock Header */}
            <div className="bg-slate-900/80 border-b border-slate-800 p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-400 font-bold border border-indigo-500/30">
                  <User className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-white truncate">
                    {conversations.find((c) => c.id === selectedConvId)?.customerName || 'Test Customer'}
                  </h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={cn(
                      "flex h-1.5 w-1.5 rounded-full",
                      waitingHere ? "bg-amber-500 animate-pulse" : "bg-emerald-500"
                    )} />
                    <span className="text-[10px] text-slate-400">
                      {waitingHere ? 'Agent is thinking...' : 'Online (Sandbox)'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {!commentMode && (
                  <button
                    onClick={handleCreateChat}
                    className="flex items-center gap-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 px-3 py-1.5 text-xs font-semibold border border-indigo-500/20"
                  >
                    <Plus className="h-3.5 w-3.5" /> New Chat
                  </button>
                )}
              </div>
            </div>

            {/* Which agent is being tested. The same prompt drives both, because one agent
                answers this store's inbox and its comment threads. */}
            <div className="flex items-center gap-1 border-b border-slate-800 bg-slate-900/40 px-3 py-2">
              {[
                { key: false, label: 'Messenger chat' },
                { key: true, label: 'Page comment' },
              ].map((tab) => (
                <button
                  key={String(tab.key)}
                  onClick={() => setCommentMode(tab.key)}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-colors',
                    commentMode === tab.key
                      ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/20'
                      : 'text-slate-400 hover:text-slate-200 border border-transparent',
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Split Grid: Conversations Sidebar + Chat Pane */}
            <div className="flex flex-1 min-h-0">
              {/* Internal Conv Selector Drawer */}
              <div className="w-1/3 border-r border-slate-800 bg-slate-900/20 overflow-y-auto flex flex-col p-2 gap-1.5">
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider px-2 py-1">
                  Active Chats
                </p>
                {conversations.length === 0 ? (
                  <div className="text-[10px] text-slate-500 text-center py-4 px-2">
                    No active sessions. Click 'New Chat' to start.
                  </div>
                ) : (
                  conversations.map((conv) => (
                    <div
                      key={conv.id}
                      onClick={() => selectChat(conv.id)}
                      className={cn(
                        'group flex items-center justify-between gap-1.5 rounded-xl p-2 cursor-pointer transition-colors',
                        selectedConvId === conv.id
                          ? 'bg-indigo-600/20 border border-indigo-500/20 text-indigo-300'
                          : 'hover:bg-slate-900 text-slate-400 hover:text-slate-200'
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold">
                          {conv.customerName || 'Test Customer'}
                        </p>
                        <p className="text-[8px] text-slate-500 truncate font-mono mt-0.5">
                          {conv.customerPlatformId}
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteChat(conv.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 p-1 rounded transition-all"
                        title="Hard Delete Chat History"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))
                )}
                {hasMoreChats && (
                  <button
                    ref={chatsEndRef}
                    onClick={loadMoreChats}
                    disabled={isLoadingMoreChats}
                    className="mt-1 rounded-lg border border-slate-800 px-2 py-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-500 transition-colors hover:bg-slate-900 hover:text-slate-300 disabled:opacity-60"
                  >
                    {isLoadingMoreChats ? 'Loading…' : 'Load more chats'}
                  </button>
                )}
              </div>

              {/* Chat Pane */}
              <div className="flex-1 flex flex-col bg-slate-950">
                {commentMode ? (
                  <>
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                      {commentThread.length === 0 ? (
                        <div className="flex h-full flex-col items-center justify-center p-8 text-center text-slate-500">
                          <MessageSquare className="h-12 w-12 text-slate-700 mb-2 stroke-[1.5]" />
                          <p className="text-xs font-semibold">Write the thread, then run it</p>
                          <p className="text-[10px] text-slate-600 mt-1 max-w-[220px]">
                            Type the earlier comments and the new one, and watch whether the agent
                            answers publicly, slips into Messenger, or stays out of it.
                          </p>
                        </div>
                      ) : (
                        commentThread.map((line) => (
                          <div
                            key={line.id}
                            className={cn(
                              'max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed shadow-sm',
                              line.from === 'customer'
                                ? 'bg-slate-900 border border-slate-800 text-slate-200 mr-auto rounded-tl-none'
                                : line.kind === 'dm'
                                  ? 'bg-emerald-700/70 text-white ml-auto rounded-tr-none'
                                  : 'bg-indigo-600 text-white ml-auto rounded-tr-none',
                            )}
                          >
                            <span
                              className={cn(
                                'block text-[8px] font-bold uppercase tracking-wider mb-1',
                                line.from === 'customer' ? 'text-slate-400' : line.kind === 'dm' ? 'text-emerald-200' : 'text-indigo-200',
                              )}
                            >
                              {line.from === 'customer' ? `${commenterName} · on the post` : line.kind === 'dm' ? 'Messenger · only they see it' : 'Page · public reply'}
                            </span>
                            <p className="whitespace-pre-wrap">{line.content}</p>
                          </div>
                        ))
                      )}

                      {commentRunning && (
                        <div className="bg-slate-900 border border-slate-800 max-w-[80%] rounded-2xl px-4 py-3 text-xs text-slate-400 mr-auto rounded-tl-none flex items-center gap-2">
                          <span className="flex gap-1">
                            <span className="h-1.5 w-1.5 bg-slate-500 rounded-full animate-bounce" />
                            <span className="h-1.5 w-1.5 bg-slate-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                            <span className="h-1.5 w-1.5 bg-slate-500 rounded-full animate-bounce [animation-delay:0.4s]" />
                          </span>
                          <span>Comment agent is deciding where to answer...</span>
                        </div>
                      )}
                      <div ref={chatEndRef} />
                    </div>

                    <form
                      onSubmit={handleRunComment}
                      className="border-t border-slate-900 p-3 bg-slate-900/30 flex flex-col gap-2"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={commenterName}
                          onChange={(e) => setCommenterName(e.target.value)}
                          placeholder="Commenter name"
                          className="w-40 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-[11px] text-slate-300 outline-none focus:border-indigo-500"
                        />
                        <p className="text-[9px] text-slate-500 leading-tight">
                          One earlier line per row. Start a row with <code className="text-slate-400">page:</code> for
                          the page's own reply.
                        </p>
                      </div>
                      <textarea
                        value={historyText}
                        onChange={(e) => setHistoryText(e.target.value)}
                        rows={3}
                        placeholder={'do you ship outside dhaka?\npage: yes, nationwide delivery available'}
                        className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-[11px] text-slate-300 placeholder-slate-600 outline-none resize-none focus:border-indigo-500"
                      />
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={commentText}
                          onChange={(e) => setCommentText(e.target.value)}
                          placeholder="The new public comment — e.g. price bhai?"
                          disabled={commentRunning}
                          className="flex-1 rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-indigo-500 disabled:opacity-50"
                        />
                        <button
                          type="submit"
                          disabled={commentRunning || !commentText.trim()}
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-500 disabled:opacity-50 transition-all"
                        >
                          <Send className="h-4 w-4" />
                        </button>
                      </div>
                    </form>
                  </>
                ) : selectedConvId ? (
                  <>
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                      {isLoadingMessages && messages.length === 0 ? (
                        <div className="space-y-3">
                          {[0, 1, 2].map((i) => (
                            <div
                              key={i}
                              className={cn(
                                'h-10 w-2/3 animate-pulse rounded-2xl',
                                i % 2 === 0
                                  ? 'mr-auto rounded-tl-none bg-slate-900'
                                  : 'ml-auto rounded-tr-none bg-indigo-950',
                              )}
                            />
                          ))}
                          <p className="text-center text-[10px] text-slate-600">
                            Loading this chat’s messages…
                          </p>
                        </div>
                      ) : (
                        messages.map((msg) => (
                          <div
                            key={msg.id}
                            className={cn(
                              'max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed shadow-sm relative group',
                              msg.from === 'customer'
                                ? 'bg-slate-900 border border-slate-800 text-slate-200 mr-auto rounded-tl-none'
                                : 'bg-indigo-600 text-white ml-auto rounded-tr-none'
                            )}
                          >
                            {msg.from === 'self' && (
                              <span className="block text-[8px] font-bold uppercase tracking-wider text-indigo-200 mb-1">
                                AI Sales Rep
                              </span>
                            )}
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                            <span
                              // These times arrive from the server now, and the browser formats them
                              // in its own zone — the moment the chat is re-read they are corrected.
                              suppressHydrationWarning
                              className="text-[8px] text-slate-500 mt-1 block text-right font-mono"
                            >
                              {new Date(msg.time).toLocaleTimeString()}
                            </span>
                          </div>
                        ))
                      )}

                      {chatRunning && (
                        <div className="bg-slate-900 border border-slate-800 max-w-[80%] rounded-2xl px-4 py-3 text-xs text-slate-400 mr-auto rounded-tl-none flex items-center gap-2">
                          <span className="flex gap-1">
                            <span className="h-1.5 w-1.5 bg-slate-500 rounded-full animate-bounce" />
                            <span className="h-1.5 w-1.5 bg-slate-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                            <span className="h-1.5 w-1.5 bg-slate-500 rounded-full animate-bounce [animation-delay:0.4s]" />
                          </span>
                          <span>Agent is typing...</span>
                        </div>
                      )}
                      <div ref={chatEndRef} />
                    </div>

                    {/* Chat Input Bar */}
                    <form
                      onSubmit={handleSendMessage}
                      className="border-t border-slate-900 p-3 bg-slate-900/30 flex gap-2"
                    >
                      <input
                        type="text"
                        value={inputMessage}
                        onChange={(e) => setInputMessage(e.target.value)}
                        placeholder="Ask the sales agent a question..."
                        disabled={chatRunning}
                        className="flex-1 rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-indigo-500 disabled:opacity-50"
                      />
                      <button
                        type="submit"
                        disabled={chatRunning || !inputMessage.trim()}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-500 disabled:opacity-50 transition-all"
                      >
                        <Send className="h-4 w-4" />
                      </button>
                    </form>
                  </>
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-slate-500">
                    <MessageSquare className="h-12 w-12 text-slate-700 mb-2 stroke-[1.5]" />
                    <p className="text-xs font-semibold">Select or Seed a Conversation</p>
                    <p className="text-[10px] text-slate-600 mt-1 max-w-[200px]">
                      Initiate a test chat to run diagnostic steps against your agent.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: SSE Terminal Event Logs (xl:col-span-3) */}
        <div className="xl:col-span-3 flex flex-col gap-6">
          <div className="rounded-3xl border border-slate-800 bg-slate-950 p-4 h-[650px] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-900 pb-3 mb-3">
              <div className="flex items-center gap-2">
                <TerminalIcon className="h-4.5 w-4.5 text-indigo-400" />
                <h2 className="text-xs font-bold text-white uppercase tracking-wider">
                  Live SSE Trace
                </h2>
              </div>
              <span className="flex items-center rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-[8px] font-bold text-indigo-400 border border-indigo-500/20 animate-pulse">
                <Activity className="h-3 w-3 mr-1" /> streaming
              </span>
            </div>

            {/* Terminal logs list */}
            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 font-mono text-[9px] leading-relaxed">
              {logs.length === 0 ? (
                <div className="text-slate-600 text-center py-12">
                  No active run logs.<br />Send a message to stream live traces.
                </div>
              ) : (
                logs.map((log) => {
                  let badgeColor = 'bg-slate-800 text-slate-400';
                  let eventLabel = log.event;

                  if (log.event === 'runner_start' || log.event === 'agent_start') {
                    badgeColor = 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
                  } else if (log.event === 'tool_call') {
                    badgeColor = 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
                    eventLabel = `tool_call: ${log.data.name}`;
                  } else if (log.event === 'tool_result') {
                    badgeColor = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
                    eventLabel = `tool_result: ${log.data.name}`;
                  } else if (log.event === 'message_sent' || log.event === 'reply') {
                    badgeColor = 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20';
                  } else if (log.event === 'comment_replied') {
                    badgeColor = 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20';
                    eventLabel = 'comment_replied (public)';
                  } else if (log.event === 'private_message_sent') {
                    badgeColor = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
                    eventLabel = 'private_message_sent (Messenger)';
                  } else if (log.event === 'no_reply') {
                    badgeColor = 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
                  } else if (log.event === 'done' || log.event === 'runner_done') {
                    badgeColor = 'bg-purple-500/10 text-purple-400 border border-purple-500/20';
                  } else if (log.event === 'error' || log.event === 'runner_error') {
                    badgeColor = 'bg-red-500/10 text-red-400 border border-red-500/20 animate-pulse';
                  }

                  return (
                    <div
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      className={cn(
                        'border border-slate-900 rounded-lg p-2 bg-slate-900/10 hover:bg-slate-900/40 cursor-pointer transition-colors',
                        selectedLog?.id === log.id && 'border-indigo-500/30 bg-slate-900/60'
                      )}
                    >
                      <div className="flex items-center justify-between gap-1.5 mb-1">
                        <span className={cn('px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider', badgeColor)}>
                          {eventLabel}
                        </span>
                        <span className="text-slate-600 text-[8px]">{log.timestamp}</span>
                      </div>
                      
                      {log.event === 'tool_call' && (
                        <p className="text-amber-300/80 truncate">
                          args: {JSON.stringify(log.data.args)}
                        </p>
                      )}
                      {log.event === 'tool_result' && (
                        <p className="text-emerald-300/80 truncate">
                          res: {log.data.result}
                        </p>
                      )}
                      {(log.event === 'message_sent' || log.event === 'comment_replied' || log.event === 'private_message_sent') && (
                        <p className="text-cyan-300/80 truncate">
                          text: "{log.data.text}"
                        </p>
                      )}
                      {log.event === 'error' && (
                        <p className="text-red-400 font-semibold truncate">
                          {log.data.message}
                        </p>
                      )}
                    </div>
                  );
                })
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>
      </div>

      {/* SSE Log Inspect Modal (Drawer/Overlay) */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-end">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setSelectedLog(null)}
          />
          <div className="relative w-[450px] max-w-[90vw] h-full bg-slate-950 border-l border-slate-800 p-6 flex flex-col shadow-2xl animate-in slide-in-from-right duration-200 text-slate-200">
            <div className="flex items-center justify-between border-b border-slate-900 pb-4 mb-4">
              <div>
                <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider">
                  Trace Event Details
                </span>
                <h3 className="text-sm font-bold text-white font-mono mt-0.5">
                  {selectedLog.event}
                </h3>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-slate-500 hover:text-white text-xs font-semibold p-1"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-auto rounded-xl border border-slate-900 bg-slate-900/20 p-4 font-mono text-[10px] leading-relaxed">
              <p className="text-slate-500 mb-2">// Timestamp: {selectedLog.timestamp}</p>
              <pre className="text-slate-300 whitespace-pre-wrap break-all">
                {JSON.stringify(selectedLog.data, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
