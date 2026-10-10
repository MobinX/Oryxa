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
 * The page id a test chat runs on, so a test is never mistaken for a real customer thread.
 * Namespaced by store: (platform, page id) is unique across live channels, so one shared id
 * would be claimed by the first store that opened the playground and leave every other store —
 * and the operator's sandbox — unable to create its own.
 */
const sandboxPageId = (businessId: string) => `mock-channel-${businessId}`;

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
  canEditPrompt = false,
}: {
  token: string;
  businessId: string;
  /** Only the operator console passes this: a store sees its prompt, it does not write it. */
  canEditPrompt?: boolean;
}) {
  // State
  const [agent, setAgent] = useState<Agent | null>(null);
  const [systemPrompt, setSystemPrompt] = useState<string>('');
  const [isUpdatingPrompt, setIsUpdatingPrompt] = useState(false);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  const [inputMessage, setInputMessage] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [selectedLog, setSelectedLog] = useState<LogEvent | null>(null);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

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

  // Scroll logs and chats to bottom on updates
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  async function loadSandbox() {
    try {
      const [agentRow, channelList] = await Promise.all([
        getDefaultAgent(token, businessId),
        listChannels(token, businessId),
      ]);

      setAgent(agentRow);
      setSystemPrompt(agentRow.systemPrompt || '');

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

      if (sandbox) setActiveChannel(sandbox);
    } catch (err) {
      console.error('Failed to load the playground sandbox:', err);
    }
  }

  async function loadConversations() {
    try {
      const convList = await listConversations(token, businessId);
      // Filter conversations belonging to the active channel
      const filtered = convList.filter((c) => c.channelId === activeChannel?.id);
      setConversations(filtered);
      if (filtered.length > 0 && !selectedConvId) {
        setSelectedConvId(filtered[0]!.id);
      }
    } catch (err) {
      console.error('Failed to load conversations:', err);
    }
  }

  async function loadMessages(convId: string) {
    setIsLoadingMessages(true);
    try {
      const msgList = await listMessages(token, businessId, convId);
      setMessages(msgList || []);
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      setIsLoadingMessages(false);
    }
  }

  async function handleSaveSystemPrompt() {
    if (!agent) return;
    setIsUpdatingPrompt(true);
    try {
      await updateAgent(token, businessId, agent.id, { systemPrompt });
      setAgent({ ...agent, systemPrompt });
      addLog('system_prompt_updated', { systemPrompt });
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
    setIsThinking(true);
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

      await parseSseStream(response);
      await loadConversations();
    } catch (err) {
      console.error('Failed to seed conversation:', err);
    } finally {
      setIsThinking(false);
    }
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
    setInputMessage('');
    setIsThinking(true);
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
      await loadMessages(selectedConvId);
    } catch (err) {
      console.error('Failed during agent test run stream:', err);
    } finally {
      setIsThinking(false);
    }
  }

  async function parseSseStream(res: Response) {
    const reader = res.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent = '';

    while (true) {
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
          const rawData = trimmed.slice(6).trim();
          try {
            const data = JSON.parse(rawData);
            addLog(currentEvent, data);
            
            // Auto-select conversation if it was created
            if (currentEvent === 'conversation_ready') {
              setSelectedConvId(data.conversationId);
            }
          } catch {
            // Raw text fallback
            addLog(currentEvent, { text: rawData });
          }
          currentEvent = ''; // Reset
        }
      }
    }
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
              Chat as a mock customer against your sandbox page and watch every tool call, result and
              reply stream in.
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
                  {canEditPrompt ? 'Applies to the next test message' : 'Managed by Oryxa'}
                </span>
              </div>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                readOnly={!canEditPrompt}
                rows={12}
                className={cn(
                  'w-full rounded-xl border border-slate-800 bg-slate-950 p-4 text-xs font-mono text-slate-300 outline-none leading-relaxed resize-none',
                  canEditPrompt ? 'focus:border-indigo-500' : 'cursor-default opacity-80',
                )}
                placeholder="Your assistant's instructions..."
              />
              {canEditPrompt && (
                <button
                  onClick={handleSaveSystemPrompt}
                  disabled={isUpdatingPrompt}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-indigo-600/10 border border-indigo-500/20 py-2.5 text-xs font-bold text-indigo-400 hover:bg-indigo-600/20 active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {isUpdatingPrompt ? (
                    <>Saving...</>
                  ) : (
                    <>
                      <Check className="h-4 w-4" /> Save System Prompt
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

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
                      isThinking ? "bg-amber-500 animate-pulse" : "bg-emerald-500"
                    )} />
                    <span className="text-[10px] text-slate-400">
                      {isThinking ? 'Agent is thinking...' : 'Online (Sandbox)'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCreateChat}
                  className="flex items-center gap-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 px-3 py-1.5 text-xs font-semibold border border-indigo-500/20"
                >
                  <Plus className="h-3.5 w-3.5" /> New Chat
                </button>
              </div>
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
                      onClick={() => setSelectedConvId(conv.id)}
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
              </div>

              {/* Chat Pane */}
              <div className="flex-1 flex flex-col bg-slate-950">
                {selectedConvId ? (
                  <>
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                      {messages.map((msg) => (
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
                          <span className="text-[8px] text-slate-500 mt-1 block text-right font-mono">
                            {new Date(msg.time).toLocaleTimeString()}
                          </span>
                        </div>
                      ))}

                      {isThinking && (
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
                        disabled={isThinking}
                        className="flex-1 rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-indigo-500 disabled:opacity-50"
                      />
                      <button
                        type="submit"
                        disabled={isThinking || !inputMessage.trim()}
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
                      {log.event === 'message_sent' && (
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
