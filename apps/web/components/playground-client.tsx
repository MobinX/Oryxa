'use client';

import { useState, useEffect, useRef } from 'react';
import { COMPANY_NAME } from '@/lib/brand';
import type { Tiktoken } from 'js-tiktoken/lite';
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
import { uploadVariantImageDirect } from '@/lib/uploads-client';
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
  Paperclip,
  X,
  Sigma,
  Wrench,
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
 * How long a run may hold a pane with nothing arriving before the pane stops waiting. A server
 * that neither writes nor hangs up would otherwise keep the waiting animation up forever, which
 * is the one failure mode a debugging console must not have.
 */
const RUN_IDLE_MS = 90_000;

/** How long a chat's loading skeleton may claim the pane before it admits the read is slow. */
const CHAT_READ_MS = 20_000;

/** A stall, not a fault: nothing arrived, nothing failed. Only this one is handled quietly. */
const STREAM_STALLED = new Error('playground stream idle');

/** One chunk of the stream, or the stall sentinel when nothing arrives inside the idle window. */
function readNextChunk(reader: ReadableStreamDefaultReader<Uint8Array>) {
  // Named from the reader itself: the chunk type carries different names across lib versions, and
  // spelling one of them out here is a build error waiting to happen on whichever one is absent.
  type Chunk = Awaited<ReturnType<typeof reader.read>>;
  return new Promise<Chunk>((resolve, reject) => {
    const timer = setTimeout(() => reject(STREAM_STALLED), RUN_IDLE_MS);
    reader.read().then(
      (chunk) => {
        clearTimeout(timer);
        resolve(chunk);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

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
  /** The pictures the turn was sent with — a test photo reads back as a signed URL. */
  images?: string[];
}

interface LogEvent {
  id: string;
  timestamp: string;
  event: string;
  data: any;
}

/** What one model call charged, as the provider reported it — the shape `packages/agent` ships on the `trace` event. */
interface TraceUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens: number;
  reasoningTokens: number;
}

interface TraceToolCall {
  id: string;
  name: string;
  args: unknown;
}

/** One message of the agent's turn: who said it, what it said, what it charged. */
interface TraceMessage {
  role: 'system' | 'user' | 'ai' | 'tool';
  content: string;
  toolCalls?: TraceToolCall[];
  toolCallId?: string;
  toolName?: string;
  usage?: TraceUsage | null;
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
  // The prompt's size in the model's own tokens, not characters. Counted 500ms after typing stops, with
  // the tokenizer built once and kept for the life of the page: building it is the expensive part, and
  // the ranks are only worth loading if somebody actually edits the prompt. js-tiktoken holds plain JS
  // data rather than wasm memory, so there is no free() to call and its type does not offer one.
  const [promptTokens, setPromptTokens] = useState<number | null>(null);
  const [promptCounting, setPromptCounting] = useState(false);
  const tokenizerRef = useRef<Tiktoken | null>(null);

  useEffect(() => {
    setPromptCounting(true);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          let tokenizer = tokenizerRef.current;
          if (!tokenizer) {
            // js-tiktoken's main entry inlines all six rank tables — 10.7 MB of literal — so ask for the
            // lite class and the one table this count actually needs.
            const [{ Tiktoken }, { default: cl100k_base }] = await Promise.all([
              import('js-tiktoken/lite'),
              import('js-tiktoken/ranks/cl100k_base'),
            ]);
            tokenizer = new Tiktoken(cl100k_base);
            tokenizerRef.current = tokenizer;
          }
          setPromptTokens(tokenizer.encode(systemPrompt).length);
        } catch {
          setPromptTokens(null);
        } finally {
          setPromptCounting(false);
        }
      })();
    }, 500);
    return () => clearTimeout(timer);
  }, [systemPrompt]);
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
  /** A chat that never arrived is not an empty chat: the pane says which, and offers the retry. */
  const [chatLoadError, setChatLoadError] = useState<string | null>(null);
  const [hasMoreChats, setHasMoreChats] = useState(
    (preload?.conversations.length ?? 0) >= PLAYGROUND_CHAT_PAGE,
  );
  const [isLoadingMoreChats, setIsLoadingMoreChats] = useState(false);
  /** Mobile only: the chat list is a third of the pane, which is nobody's reading width. */
  const [chatsDrawerOpen, setChatsDrawerOpen] = useState(false);

  const [inputMessage, setInputMessage] = useState('');
  /**
   * Pictures waiting in the composer. The bytes are already in storage by the time a run starts,
   * so the body carries keys only — the same column a Messenger photo is copied into.
   */
  const [pendingPhotos, setPendingPhotos] = useState<{ key: string; previewUrl: string }[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  /**
   * The run in flight, and the pane it streams into: a chat run belongs to the chat it was started
   * from — the new one it seeds takes the run over as soon as the stream names it — and a comment
   * run to the comment thread. The waiting state follows that pane instead of the whole console, so
   * a run cannot leave the chat list, New Chat and every other thread looking frozen while it
   * streams, and no chat can inherit another chat's wait.
   */
  const [run, setRun] = useState<{ id: number; pane: 'chat' | 'comment'; convId: string } | null>(
    null,
  );
  const [logs, setLogs] = useState<LogEvent[]>([]);
  /** The whole turn as the model saw it, handed over in one `trace` event when the run ends. */
  const [trace, setTrace] = useState<TraceMessage[]>([]);
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

  // A run animates and blocks only the thread it belongs to, and never a thread tapped afterwards.
  const chatRunning = run?.pane === 'chat' && run.convId === selectedConvId;
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
    setChatLoadError(null);
    setIsLoadingMessages(true);
    // A read that never answers must not own the pane: past the window the skeleton stands down,
    // and the messages still paint the moment the request lands.
    setTimeout(() => {
      if (seq === loadSeqRef.current) setIsLoadingMessages(false);
    }, CHAT_READ_MS);
    try {
      const msgList = await listMessages(token, businessId, convId);
      // Somebody tapped another chat while this read was on its way; its answer is not this pane's.
      if (seq !== loadSeqRef.current) return;
      setMessages(msgList || []);
    } catch (err) {
      if (seq === loadSeqRef.current) {
        console.error('Failed to load messages:', err);
        setChatLoadError(err instanceof Error && err.message ? err.message : 'The chat did not load.');
      }
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
      // The prompt box opens holding the DEFAULT's text for a store that follows it, so sending it
      // unchanged would let a plain Save claim ownership of words nobody typed. Only a real edit writes.
      const tookOwnPrompt = Boolean(systemPrompt.trim()) && systemPrompt !== (agent.systemPrompt ?? '');
      const payload = tookOwnPrompt ? { systemPrompt, ...guidance } : guidance;
      await updateAgent(token, businessId, agent.id, payload);
      setAgent({ ...agent, ...payload, ...(tookOwnPrompt ? { followsDefault: false } : {}) });
      // A box that resolved to null shows the built-in text again, not what was typed in it.
      setReplyGuidance(guidance.replyGuidance ?? '');
      setCommentReplyGuidance(guidance.commentReplyGuidance ?? '');
      addLog('system_prompt_updated', payload);
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
    setRun({ id: myRun, pane: 'chat', convId: selectedConvId });
    setLogs([]);
    setTrace([]);
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
        if (event === 'trace') setTrace(Array.isArray(data.messages) ? data.messages : []);
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
    if (convId === selectedConvId) {
      // Already on screen, so a second tap only means something after a failed read — and re-setting
      // the same id would not re-run the effect, so this one has to re-read by hand.
      if (chatLoadError) void loadMessages(convId);
      return;
    }
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

  /** A picture goes to storage from the browser and comes back as a key, exactly like the webhook's copy. */
  async function handleAttachPhoto(file: File) {
    setUploadingPhoto(true);
    try {
      const photo = await uploadVariantImageDirect(businessId, file, undefined, token);
      setPendingPhotos((prev) => (prev.length >= 4 ? prev : [...prev, photo]));
    } catch (err) {
      console.error('Failed to attach a picture to the test run:', err);
      alert(err instanceof Error ? err.message : 'Could not attach that picture');
    } finally {
      setUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    const userMessage = inputMessage.trim();
    const photos = pendingPhotos;
    if ((!userMessage && photos.length === 0) || !activeChannel || !selectedConvId) return;

    const convId = selectedConvId;
    setInputMessage('');
    setPendingPhotos([]);
    const myRun = ++runIdRef.current;
    setRun({ id: myRun, pane: 'chat', convId });
    setLogs([]); // Reset log panel for new run
    setTrace([]); // And the transcript panel: the next run's trace must not mix with this one's

    // Optimistically push customer message to the chat view
    const optimisticMsg: Message = {
      id: `temp-${Date.now()}`,
      from: 'customer',
      content: userMessage,
      time: new Date().toISOString(),
      images: photos.map((photo) => photo.previewUrl),
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
          imageKeys: photos.map((photo) => photo.key),
          testUserId,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        alert(err.error || 'Failed to send message');
        return;
      }

      await parseSseStream(response, (event, data) => {
        if (event === 'trace') setTrace(Array.isArray(data.messages) ? data.messages : []);
      });
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
        if (event === 'stream_stalled')
          append('self', 'Stopped waiting — the stream said nothing for a minute and a half. Any reply the agent had already written is saved.', 'reply');
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
   * stream a proxy may keep open long after the agent stopped writing. A stream that says nothing
   * at all is given the same treatment after the idle window, so no run can hold a pane forever.
   */
  async function parseSseStream(res: Response, onEvent?: (event: string, data: any) => void) {
    const reader = res.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent = '';
    let finished = false;

    try {
      while (!finished) {
        const { done, value } = await readNextChunk(reader);
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
              // The trace event carries the whole transcript in one payload; the terminal shows a
              // count, and the panel beneath the stream is where the transcript itself is read.
              if (event === 'trace') addLog(event, { count: Array.isArray(data.messages) ? data.messages.length : 0 });
              else addLog(event, data);
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
    } catch (err) {
      if (err !== STREAM_STALLED) throw err;
      // The server is writing nothing and hanging up on nothing. Give the pane back and let the
      // caller read whatever the agent had already persisted.
      addLog('stream_stalled', { waitedMs: RUN_IDLE_MS });
      onEvent?.('stream_stalled', { waitedMs: RUN_IDLE_MS });
      reader.cancel().catch(() => {});
      return;
    }

    if (finished) reader.cancel().catch(() => {});
  }

  // One row per model call, in the order they happened — the header counts and sums what the
  // turn actually charged, and each row below carries its own numbers beside its own message.
  const usageRows = trace.filter((msg) => msg.usage);
  const traceTotals = usageRows.reduce(
    (acc, msg) => ({
      in: acc.in + (msg.usage?.inputTokens ?? 0),
      out: acc.out + (msg.usage?.outputTokens ?? 0),
      cache: acc.cache + (msg.usage?.cacheReadTokens ?? 0),
    }),
    { in: 0, out: 0, cache: 0 },
  );

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

              {/* What the boxes below hold is the platform default until this store saves, and a save
                  makes the copy its own — so the editor says which of the two it is looking at. Only once
                  the row has actually loaded: an unread editor is not evidence that anything is following. */}
              {agent && agent.followsDefault !== false && (
                <p className="mb-4 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-[10px] leading-relaxed text-indigo-200">
                  Answering with the default agent — edit that once at{' '}
                  <span className="font-mono">/admin/default-agent</span> and every store follows it.
                  Saving here writes this store&apos;s own copy, and this store stops following.
                </p>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    System Prompt
                  </label>
                  <div className="flex items-center gap-3">
                    <span
                      className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-0.5 text-[10px] font-mono text-slate-400"
                      title="Tokens the prompt costs, counted with the cl100k_base byte-pair encoding"
                    >
                      {promptCounting
                        ? 'counting…'
                        : promptTokens === null
                          ? 'tokens unavailable'
                          : `${promptTokens.toLocaleString()} tokens`}
                    </span>
                    <span className="text-[10px] font-medium text-slate-500">
                      Applies to the next test message
                    </span>
                  </div>
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
                    {agent?.replyGuidance
                      ? agent.followsDefault === false
                        ? 'Store’s own wording'
                        : 'Default wording'
                      : 'Built-in wording'}
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
                    {agent?.commentReplyGuidance
                      ? agent.followsDefault === false
                        ? 'Store’s own wording'
                        : 'Default wording'
                      : 'Built-in wording'}
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
                  built-in text, or empty it, to keep following {COMPANY_NAME}’s wording as it changes.
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
              <button
                onClick={() => setChatsDrawerOpen((open) => !open)}
                className={cn(
                  'ml-auto rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-colors lg:hidden',
                  chatsDrawerOpen
                    ? 'border-indigo-500/20 bg-indigo-600/20 text-indigo-300'
                    : 'border-slate-800 text-slate-400 hover:text-slate-200',
                )}
              >
                {chatsDrawerOpen ? 'Close chats' : 'Chats'}
              </button>
            </div>

            {/* Split Grid: Conversations Sidebar + Chat Pane */}
            <div className="relative flex flex-1 min-h-0">
              {chatsDrawerOpen && (
                // Tapping anywhere beside the drawer puts it away again.
                <div
                  onClick={() => setChatsDrawerOpen(false)}
                  className="absolute inset-0 z-20 bg-black/50 lg:hidden"
                />
              )}
              {/* Internal Conv Selector Drawer */}
              <div
                className={cn(
                  'flex-col gap-1.5 overflow-y-auto border-slate-800 bg-slate-900/20 p-2',
                  // A phone lays this over the chat, so it has to read as a surface; max-lg keeps the desktop pane's wash as it was.
                  chatsDrawerOpen
                    ? 'absolute inset-y-0 left-0 z-30 flex w-64 max-w-[85%] border-r shadow-xl max-lg:bg-slate-900/90 max-lg:backdrop-blur-xl max-lg:backdrop-saturate-150 lg:relative lg:z-auto lg:w-1/3 lg:shadow-none'
                    : 'hidden w-full lg:flex lg:w-1/3 lg:border-r',
                )}
              >
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
                      onClick={() => {
                        // On a phone the list lies over the chat, so choosing a thread puts it away.
                        setChatsDrawerOpen(false);
                        selectChat(conv.id);
                      }}
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
                        className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 text-slate-500 hover:text-red-400 p-1.5 rounded transition-all"
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
                      ) : chatLoadError ? (
                        <div className="space-y-2 py-4 text-center">
                          <p className="text-[10px] text-red-400">
                            Could not load this chat: {chatLoadError}
                          </p>
                          <button
                            type="button"
                            onClick={() => loadMessages(selectedConvId)}
                            className="rounded-lg border border-slate-800 px-3 py-1.5 text-[11px] font-semibold text-slate-300 transition-colors hover:text-slate-100"
                          >
                            Try again
                          </button>
                        </div>
                      ) : messages.length === 0 ? (
                        <p className="text-center text-[10px] text-slate-600">
                          No messages in this chat yet — send one and the agent answers it.
                        </p>
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
                            {msg.images && msg.images.length > 0 && (
                              <div className="mb-2 flex flex-wrap gap-1.5">
                                {msg.images.map((url) => (
                                  <img
                                    key={url}
                                    src={url}
                                    alt=""
                                    className="h-24 w-24 rounded-lg border border-slate-800 object-cover"
                                  />
                                ))}
                              </div>
                            )}
                            {msg.content && <div className="whitespace-pre-wrap">{msg.content}</div>}
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
                      className="border-t border-slate-900 p-3 bg-slate-900/30 flex flex-col gap-2"
                    >
                      {pendingPhotos.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {pendingPhotos.map((photo) => (
                            <div key={photo.key} className="relative">
                              <img
                                src={photo.previewUrl}
                                alt=""
                                className="h-16 w-16 rounded-lg border border-slate-800 object-cover"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setPendingPhotos((prev) => prev.filter((p) => p.key !== photo.key))
                                }
                                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-slate-300 transition-colors hover:bg-red-600 hover:text-white"
                                title="Take this picture back out"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex gap-2">
                        {/* The same four types storage accepts for a real customer's photo. */}
                        <input
                          ref={photoInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void handleAttachPhoto(file);
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => photoInputRef.current?.click()}
                          disabled={chatRunning || uploadingPhoto || pendingPhotos.length >= 4}
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-800 bg-slate-950 text-slate-400 transition-all hover:border-indigo-500 hover:text-indigo-400 disabled:opacity-50"
                          title={uploadingPhoto ? 'Sending the picture…' : 'Send a picture to the agent'}
                        >
                          {uploadingPhoto ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <Paperclip className="h-4 w-4" />
                          )}
                        </button>
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
                          disabled={
                            chatRunning ||
                            uploadingPhoto ||
                            (!inputMessage.trim() && pendingPhotos.length === 0)
                          }
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-500 disabled:opacity-50 transition-all"
                        >
                          <Send className="h-4 w-4" />
                        </button>
                      </div>
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
                      {(log.event === 'error' || log.event === 'runner_error') && (
                        <p className="text-red-400 font-semibold truncate">
                          {log.data.message || log.data.error || 'An error occurred'}
                        </p>
                      )}
                      {(log.event === 'done' || log.event === 'runner_done') && log.data?.metrics && (
                        <div className="text-[8px] space-y-0.5 mt-1 font-mono">
                          <p className="text-purple-300 font-semibold">
                            Tokens: {Number(log.data.metrics.totalTokens || 0).toLocaleString()} (in: {Number(log.data.metrics.inputTokens || 0).toLocaleString()} / out: {Number(log.data.metrics.outputTokens || 0).toLocaleString()})
                          </p>
                          <p className="text-slate-400">
                            Cache: {log.data.metrics.cacheHitPercent}% • Cost: ${Number(log.data.metrics.estimatedCostUsd || 0).toFixed(5)} • {log.data.metrics.latencyMs}ms
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              <div ref={logsEndRef} />
            </div>
          </div>

          {/* Token Analysis: the transcript the run just finished, in the order the model met it.
              The live stream above says what happened while it happened; this says what was
              actually sent, what came back, and what every model call charged for it. */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950 p-4 flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-900 pb-3 mb-3">
              <div className="flex items-center gap-2">
                <Sigma className="h-4.5 w-4.5 text-emerald-400" />
                <h2 className="text-xs font-bold text-white uppercase tracking-wider">
                  Token Analysis
                </h2>
              </div>
              {usageRows.length > 0 ? (
                <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[8px] font-bold text-emerald-400 border border-emerald-500/20">
                  {usageRows.length} metered {usageRows.length === 1 ? 'call' : 'calls'}
                </span>
              ) : null}
            </div>

            {usageRows.length > 0 ? (
              <div className="grid grid-cols-4 gap-2 mb-3">
                {[
                  { label: 'In', value: traceTotals.in, tone: 'text-blue-300' },
                  { label: 'Out', value: traceTotals.out, tone: 'text-violet-300' },
                  { label: 'Cache', value: traceTotals.cache, tone: 'text-emerald-300' },
                  { label: 'Total', value: traceTotals.in + traceTotals.out, tone: 'text-slate-200' },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-xl border border-slate-800 bg-slate-900/40 px-2 py-1.5 text-center">
                    <p className="text-[8px] font-bold uppercase tracking-wider text-slate-500">{stat.label}</p>
                    <p className={cn('text-sm font-bold tabular-nums', stat.tone)}>{stat.value.toLocaleString()}</p>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 max-h-[640px]">
              {trace.length === 0 ? (
                <div className="text-slate-600 text-center py-10 text-xs">
                  The transcript lands here when a run ends — every message the model saw, each tool
                  call it made, and what each of its calls charged.
                </div>
              ) : (
                trace.map((msg, index) => <TraceRow key={index} msg={msg} />)
              )}
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

            {selectedLog.data?.metrics && (
              <div className="mb-4 p-3.5 rounded-xl border border-purple-500/30 bg-purple-500/10 text-purple-100 font-mono text-[11px] space-y-2">
                <div className="flex items-center justify-between border-b border-purple-500/20 pb-2">
                  <span className="text-purple-300 font-bold">Total Tokens:</span>
                  <span className="text-white font-extrabold text-sm">
                    {Number(selectedLog.data.metrics.totalTokens || 0).toLocaleString()}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div>
                    <span className="text-purple-300/70">Input Tokens:</span>{' '}
                    <span className="text-slate-200 font-semibold">{Number(selectedLog.data.metrics.inputTokens || 0).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-purple-300/70">Output Tokens:</span>{' '}
                    <span className="text-slate-200 font-semibold">{Number(selectedLog.data.metrics.outputTokens || 0).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-purple-300/70">Prompt Cache Hit:</span>{' '}
                    <span className="text-emerald-400 font-semibold">{selectedLog.data.metrics.cacheHitPercent}%</span>
                  </div>
                  <div>
                    <span className="text-purple-300/70">Estimated Cost:</span>{' '}
                    <span className="text-emerald-400 font-semibold">${Number(selectedLog.data.metrics.estimatedCostUsd || 0).toFixed(6)}</span>
                  </div>
                  <div>
                    <span className="text-purple-300/70">Latency:</span>{' '}
                    <span className="text-slate-200 font-semibold">{selectedLog.data.metrics.latencyMs} ms</span>
                  </div>
                  <div>
                    <span className="text-purple-300/70">Model:</span>{' '}
                    <span className="text-slate-200 font-semibold">{selectedLog.data.metrics.model || 'default'}</span>
                  </div>
                </div>
              </div>
            )}

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

/** A read-only transcript is the one place a code block is the honest presentation of a tool's answer. */
function TraceContent({ text }: { text: string }) {
  return (
    <p className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-slate-200">
      {text || '(empty)'}
    </p>
  );
}

function TraceUsagePanel({ usage }: { usage: TraceUsage }) {
  const hitPercent =
    usage.inputTokens > 0 ? Math.round((usage.cacheReadTokens / usage.inputTokens) * 100) : 0;

  return (
    <div className="mt-2 rounded-xl border border-slate-800 bg-slate-950/80 p-2.5">
      <p className="flex items-center gap-1.5 text-[8px] font-bold uppercase tracking-wider text-slate-500 mb-2">
        <Sigma className="h-3 w-3 text-emerald-500" />
        Token usage — this model call
      </p>
      <div className="grid grid-cols-4 gap-1.5">
        {[
          { label: 'Input', value: usage.inputTokens.toLocaleString(), tone: 'text-blue-300 border-blue-500/20 bg-blue-500/5' },
          {
            label: 'Output',
            value: usage.outputTokens.toLocaleString(),
            tone: 'text-violet-300 border-violet-500/20 bg-violet-500/5',
            hint: usage.reasoningTokens > 0 ? `${usage.reasoningTokens.toLocaleString()} reasoning` : undefined,
          },
          {
            label: 'Cache read',
            value: usage.cacheReadTokens.toLocaleString(),
            tone: 'text-emerald-300 border-emerald-500/20 bg-emerald-500/5',
            hint: `${hitPercent}% of input`,
          },
          { label: 'Total', value: usage.totalTokens.toLocaleString(), tone: 'text-slate-200 border-slate-700 bg-slate-900' },
        ].map((stat) => (
          <div key={stat.label} className={cn('rounded-lg border px-1.5 py-1 text-center', stat.tone)}>
            <p className="text-[7px] font-bold uppercase tracking-wider opacity-70">{stat.label}</p>
            <p className="text-[11px] font-bold tabular-nums">{stat.value}</p>
            {stat.hint ? <p className="text-[7px] opacity-60 truncate">{stat.hint}</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * One message of the finished turn, drawn the way the conversation it belongs to would draw it:
 * the customer on the right, the agent on the left, tool traffic full-width between them, and the
 * price of each model call attached to the message that incurred it.
 */
function TraceRow({ msg }: { msg: TraceMessage }) {
  if (msg.role === 'system') {
    return (
      <details className="group rounded-xl border border-slate-800 bg-slate-900/30">
        <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-300">
          <Shield className="h-3 w-3" />
          System prompt ({msg.content.length.toLocaleString()} chars)
        </summary>
        <div className="border-t border-slate-800/60 px-3 py-2 font-mono text-[9px] leading-relaxed text-slate-500 max-h-52 overflow-y-auto whitespace-pre-wrap break-words">
          {msg.content}
        </div>
      </details>
    );
  }

  if (msg.role === 'tool') {
    return (
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-2.5">
        <p className="flex items-center gap-1.5 text-[8px] font-bold uppercase tracking-wider text-emerald-400 mb-1.5">
          <Wrench className="h-3 w-3" />
          {msg.toolName || 'tool'} result
          <span className="text-slate-600 font-mono normal-case">{msg.toolCallId}</span>
        </p>
        <div className="max-h-44 overflow-y-auto font-mono">
          <TraceContent text={msg.content} />
        </div>
      </div>
    );
  }

  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm border border-slate-700 bg-slate-800/60 px-3 py-2">
          <p className="flex items-center gap-1 text-[8px] font-bold uppercase tracking-wider text-slate-500 mb-1 justify-end">
            <User className="h-3 w-3" /> Customer
          </p>
          <TraceContent text={msg.content} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start">
      <div className="max-w-[92%] rounded-2xl rounded-bl-sm border border-indigo-500/25 bg-indigo-500/10 px-3 py-2">
        <p className="flex items-center gap-1 text-[8px] font-bold uppercase tracking-wider text-indigo-300 mb-1">
          <Bot className="h-3 w-3" /> Agent
        </p>
        <TraceContent text={msg.content} />
      </div>

      {(msg.toolCalls ?? []).map((call) => (
        <div key={call.id} className="mt-1.5 w-full rounded-xl border border-amber-500/25 bg-amber-500/5 p-2.5">
          <p className="flex items-center gap-1.5 text-[8px] font-bold uppercase tracking-wider text-amber-400 mb-1">
            <Wrench className="h-3 w-3" />
            {call.name}
          </p>
          <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[9px] leading-relaxed text-amber-200/70">
            {JSON.stringify(call.args, null, 2)}
          </pre>
        </div>
      ))}

      {msg.usage ? <TraceUsagePanel usage={msg.usage} /> : null}
    </div>
  );
}
