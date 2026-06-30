'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ImageUpload } from '@/components/image-upload';
import {
  createPost,
  updatePost,
  deletePost,
  publishPost,
  syncPost,
  generatePost,
  tunePost,
  getPost,
  type Post,
  type PostDetail,
  type PostState,
} from '@/lib/api';
import {
  Facebook,
  Instagram,
  Plus,
  Trash2,
  Sparkles,
  Clock,
  Send,
  Check,
  Loader2,
  BarChart2,
  FileText,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type PostsClientProps = {
  token: string;
  businessId: string;
  initialPosts: Post[];
  channels: any[];
  products: any[];
};

export function PostsClient({
  token,
  businessId,
  initialPosts,
  channels,
  products,
}: PostsClientProps) {
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [selectedPostDetail, setSelectedPostDetail] = useState<PostDetail | null>(null);
  const [filterPlatform, setFilterPlatform] = useState<'all' | 'facebook' | 'instagram'>('all');

  // Loading states
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [tuning, setTuning] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Content edit state
  const [content, setContent] = useState('');
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [scheduledAt, setScheduledAt] = useState('');

  // AI Generator state
  const [sourceMode, setSourceMode] = useState<'write' | 'ai'>('write');
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id || '');
  const [selectedTone, setSelectedTone] = useState('friendly');

  // AI Tune instruction state
  const [aiInstruction, setAiInstruction] = useState('');

  // Toast-like message state
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Auto-clear message
  useEffect(() => {
    if (errorMsg || successMsg) {
      const timer = setTimeout(() => {
        setErrorMsg(null);
        setSuccessMsg(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [errorMsg, successMsg]);

  // Fetch full post details when selection changes
  useEffect(() => {
    if (!selectedPostId) {
      setSelectedPostDetail(null);
      setContent('');
      setMediaUrls([]);
      setScheduledAt('');
      return;
    }

    async function loadDetail() {
      setLoadingDetail(true);
      setErrorMsg(null);
      try {
        const detail = await getPost(token, businessId, selectedPostId!);
        setSelectedPostDetail(detail);
        setContent(detail.content);
        setMediaUrls(detail.mediaUrls || []);
        if (detail.scheduledAt) {
          // Format ISO timestamp to YYYY-MM-DDTHH:MM for datetime-local input
          const d = new Date(detail.scheduledAt);
          const tzoffset = d.getTimezoneOffset() * 60000; //offset in milliseconds
          const localISOTime = new Date(d.getTime() - tzoffset).toISOString().slice(0, 16);
          setScheduledAt(localISOTime);
        } else {
          setScheduledAt('');
        }
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to load post details');
      } finally {
        setLoadingDetail(false);
      }
    }

    void loadDetail();
  }, [selectedPostId, token, businessId]);

  // Filter posts
  const filteredPosts = posts.filter((post) => {
    if (filterPlatform === 'all') return true;
    const channel = channels.find((c) => c.id === post.channelId);
    return channel?.platform === filterPlatform;
  });

  const activeChannel = selectedPostDetail
    ? channels.find((c) => c.id === selectedPostDetail.channelId)
    : null;

  // 1. Create a blank draft post
  async function handleCreatePost() {
    if (channels.length === 0) {
      setErrorMsg('Please connect a channel in the Channels tab before creating posts.');
      return;
    }
    setCreating(true);
    setErrorMsg(null);
    try {
      const defaultChannel = channels[0];
      const created = await createPost(token, businessId, {
        channelId: defaultChannel.id,
        content: '',
      });
      setPosts([created, ...posts]);
      setSelectedPostId(created.id);
      setSuccessMsg('Created a new draft post.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create post');
    } finally {
      setCreating(false);
    }
  }

  // 2. Save / update post content & settings
  async function handleSavePost(newState?: PostState) {
    if (!selectedPostId) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const scheduleDate = scheduledAt ? new Date(scheduledAt).toISOString() : null;
      const computedState = newState || (scheduleDate ? 'scheduled' : 'draft');

      const updated = await updatePost(token, businessId, selectedPostId, {
        content,
        mediaUrls,
        scheduledAt: scheduleDate,
        postState: computedState,
      });

      // Update posts list
      setPosts(posts.map((p) => (p.id === selectedPostId ? { ...p, content, postState: computedState, scheduledAt: scheduleDate } : p)));
      
      // Update local detail
      if (selectedPostDetail) {
        setSelectedPostDetail({
          ...selectedPostDetail,
          content,
          mediaUrls,
          scheduledAt: scheduleDate,
          postState: computedState,
        });
      }

      setSuccessMsg('Post draft saved.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save post');
    } finally {
      setSaving(false);
    }
  }

  // 3. Delete Post
  async function handleDeletePost(postId: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this draft?')) return;
    setErrorMsg(null);
    try {
      await deletePost(token, businessId, postId);
      setPosts(posts.filter((p) => p.id !== postId));
      if (selectedPostId === postId) {
        setSelectedPostId(null);
      }
      setSuccessMsg('Post deleted successfully.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to delete post');
    }
  }

  // 4. Publish Post Now
  async function handlePublishPost() {
    if (!selectedPostId) return;
    setPublishing(true);
    setErrorMsg(null);
    try {
      // First save the current editor state
      const scheduleDate = scheduledAt ? new Date(scheduledAt).toISOString() : null;
      await updatePost(token, businessId, selectedPostId, {
        content,
        mediaUrls,
        scheduledAt: scheduleDate,
      });

      // Then trigger publish
      const res = await publishPost(token, businessId, selectedPostId);
      
      // Update list & detail
      setPosts(posts.map((p) => (p.id === selectedPostId ? { ...p, postState: 'published', platformPostId: res.platformPostId, publishedAt: res.publishedAt } : p)));
      if (selectedPostDetail) {
        setSelectedPostDetail({
          ...selectedPostDetail,
          postState: 'published',
          platformPostId: res.platformPostId,
          publishedAt: res.publishedAt,
        });
      }

      setSuccessMsg('Post published to page feed successfully!');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Publish failed. Verify API token scopes.');
      // Keep state as failed
      setPosts(posts.map((p) => (p.id === selectedPostId ? { ...p, postState: 'failed' } : p)));
    } finally {
      setPublishing(false);
    }
  }

  // 5. Sync analytics stats from platform
  async function handleSyncStats() {
    if (!selectedPostId || !selectedPostDetail?.platformPostId) return;
    setSyncing(true);
    setErrorMsg(null);
    try {
      const stats = await syncPost(token, businessId, selectedPostId);
      setSelectedPostDetail({
        ...selectedPostDetail,
        latestSync: stats,
      });
      setSuccessMsg('Stats synced from platform.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to sync stats');
    } finally {
      setSyncing(false);
    }
  }

  // 6. AI Generate from Product
  async function handleAIGenerate() {
    if (channels.length === 0) {
      setErrorMsg('Please connect a channel first.');
      return;
    }
    if (!selectedProductId) {
      setErrorMsg('Please select a product first.');
      return;
    }

    setGenerating(true);
    setErrorMsg(null);
    try {
      const channelId = selectedPostDetail?.channelId || channels[0].id;
      const created = await generatePost(token, businessId, {
        channelId,
        productId: selectedProductId,
        tone: selectedTone,
      });

      setPosts([created, ...posts]);
      setSelectedPostId(created.id);
      setSourceMode('write');
      setSuccessMsg('AI-generated draft ready!');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'AI generation failed');
    } finally {
      setGenerating(false);
    }
  }

  // 7. AI Tune Existing Draft
  async function handleAITune() {
    if (!selectedPostId) return;
    if (!aiInstruction.trim()) return;

    setTuning(true);
    setErrorMsg(null);
    try {
      const updated = await tunePost(token, businessId, selectedPostId, aiInstruction);
      setContent(updated.content);
      setSelectedPostDetail({
        ...selectedPostDetail!,
        content: updated.content,
        aiPrompt: aiInstruction,
      });
      // Update list
      setPosts(posts.map((p) => (p.id === selectedPostId ? { ...p, content: updated.content } : p)));
      setAiInstruction('');
      setSuccessMsg('Draft optimized by AI.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'AI tuning failed');
    } finally {
      setTuning(false);
    }
  }

  // Attachments handlers
  function handleImageUploaded(img: { key: string; previewUrl: string }) {
    setMediaUrls([...mediaUrls, img.previewUrl]);
  }

  function handleRemoveImage(indexToRemove: number) {
    setMediaUrls(mediaUrls.filter((_, idx) => idx !== indexToRemove));
  }

  // Character counter limits
  const charLimit = activeChannel?.platform === 'instagram' ? 2200 : 63206;
  const isOverLimit = content.length > charLimit;

  return (
    <div className="flex flex-1 flex-col overflow-hidden lg:flex-row min-h-0">
      
      {/* Toast Overlay */}
      {(errorMsg || successMsg) && (
        <div className="absolute top-4 right-4 z-50 flex flex-col gap-2 max-w-sm animate-in fade-in slide-in-from-top-4">
          {errorMsg && (
            <div className="flex items-center gap-2 rounded-xl bg-destructive p-4 text-xs font-semibold text-destructive-foreground shadow-lg border border-destructive/20">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
          {successMsg && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-600 p-4 text-xs font-semibold text-white shadow-lg border border-emerald-500/20">
              <Check className="h-4 w-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}
        </div>
      )}

      {/* Left panel: Post List */}
      <div className="border-b border-border/40 lg:w-80 lg:shrink-0 lg:border-b-0 lg:border-r flex flex-col bg-muted/10 min-h-0">
        
        {/* Header Actions */}
        <div className="p-4 border-b border-border/40 flex items-center justify-between gap-2 shrink-0">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Drafts & Posts</h2>
          <Button
            size="sm"
            onClick={handleCreatePost}
            disabled={creating || channels.length === 0}
            className="rounded-lg h-8 gap-1 font-semibold"
          >
            {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            New Post
          </Button>
        </div>

        {/* Filter Platform tabs */}
        <div className="px-4 py-2 border-b border-border/40 bg-card flex gap-1 shrink-0">
          <button
            onClick={() => setFilterPlatform('all')}
            className={cn(
              'px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
              filterPlatform === 'all'
                ? 'bg-primary/10 text-primary font-bold'
                : 'text-muted-foreground hover:bg-muted',
            )}
          >
            All
          </button>
          <button
            onClick={() => setFilterPlatform('facebook')}
            className={cn(
              'px-2.5 py-1 text-xs font-medium rounded-md flex items-center gap-1 transition-colors',
              filterPlatform === 'facebook'
                ? 'bg-primary/10 text-primary font-bold'
                : 'text-muted-foreground hover:bg-muted',
            )}
          >
            <Facebook className="h-3 w-3" /> Facebook
          </button>
          <button
            disabled
            className="px-2.5 py-1 text-xs font-medium text-muted-foreground/50 flex items-center gap-1 cursor-not-allowed"
            title="Instagram posting is coming soon!"
          >
            <Instagram className="h-3 w-3" /> Instagram
            <span className="text-[9px] px-1 py-0.5 rounded bg-muted/80 text-muted-foreground scale-90 origin-left">soon</span>
          </button>
        </div>

        {/* Posts List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
          {filteredPosts.length === 0 ? (
            <div className="text-center text-xs text-muted-foreground py-8">
              No posts found. Click "+ New Post" to start a draft.
            </div>
          ) : (
            filteredPosts.map((post) => {
              const channel = channels.find((c) => c.id === post.channelId);
              const isSelected = selectedPostId === post.id;
              
              return (
                <div
                  key={post.id}
                  onClick={() => setSelectedPostId(post.id)}
                  className={cn(
                    'group relative rounded-xl border p-3 cursor-pointer transition-all duration-200 hover:shadow-sm',
                    isSelected
                      ? 'bg-card border-primary ring-1 ring-primary/20 shadow-sm'
                      : 'bg-card/50 border-border hover:bg-card hover:border-border/80',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {channel?.platform === 'facebook' ? (
                        <Facebook className="h-3 w-3 text-blue-600" />
                      ) : (
                        <Instagram className="h-3 w-3 text-pink-600" />
                      )}
                      <span className="truncate max-w-[120px] font-medium">
                        {channel?.extraInfo ? JSON.parse(channel.extraInfo).name : 'Meta Page'}
                      </span>
                    </div>

                    <span
                      className={cn(
                        'text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full',
                        post.postState === 'published' && 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
                        post.postState === 'scheduled' && 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300',
                        post.postState === 'draft' && 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
                        post.postState === 'failed' && 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300',
                      )}
                    >
                      {post.postState}
                    </span>
                  </div>

                  <p className="mt-2 text-xs text-foreground/80 line-clamp-2 min-h-[2rem]">
                    {post.content || <em className="text-muted-foreground">Empty post draft</em>}
                  </p>

                  <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>
                      {new Date(post.createdAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                    
                    {/* Hard Delete Button */}
                    <button
                      onClick={(e) => handleDeletePost(post.id, e)}
                      className="opacity-0 group-hover:opacity-100 hover:text-destructive p-1 rounded transition-opacity"
                      title="Delete draft"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right panel: Composer / Detail */}
      <div className="flex-1 flex flex-col min-h-0 bg-card">
        {selectedPostId && selectedPostDetail ? (
          <div className="flex-1 flex flex-col min-h-0">
            {loadingDetail ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-6 space-y-6">
                
                {/* 1. Header with Milestones */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-4 shrink-0">
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block">
                      Target Channel
                    </label>
                    <div className="flex items-center gap-2">
                      {activeChannel?.platform === 'facebook' ? (
                        <Facebook className="h-5 w-5 text-blue-600 shrink-0" />
                      ) : (
                        <Instagram className="h-5 w-5 text-pink-600 shrink-0" />
                      )}
                      
                      {selectedPostDetail.postState === 'published' ? (
                        <span className="text-sm font-bold text-foreground">
                          {activeChannel?.extraInfo
                            ? JSON.parse(activeChannel.extraInfo).name
                            : 'Connected Page'}{' '}
                          ({activeChannel?.platform})
                        </span>
                      ) : (
                        <Select
                          value={selectedPostDetail.channelId}
                          onChange={async (e) => {
                            const newChannelId = e.target.value;
                            try {
                              const updated = await updatePost(token, businessId, selectedPostDetail.id, {
                                channelId: newChannelId,
                              });
                              setPosts(posts.map((p) => p.id === selectedPostDetail.id ? { ...p, channelId: newChannelId } : p));
                              setSelectedPostDetail({
                                ...selectedPostDetail,
                                channelId: newChannelId,
                              });
                              setSuccessMsg('Target channel updated.');
                            } catch (err) {
                              setErrorMsg(err instanceof Error ? err.message : 'Failed to update channel');
                            }
                          }}
                          className="h-9 py-1 text-xs w-56 bg-card font-semibold"
                        >
                          {channels.map((chan) => {
                            const info = chan.extraInfo ? JSON.parse(chan.extraInfo) : null;
                            const label = info?.name || `${chan.platform} (${chan.platformChannelId})`;
                            return (
                              <option key={chan.id} value={chan.id}>
                                {label} ({chan.platform})
                              </option>
                            );
                          })}
                        </Select>
                      )}
                    </div>
                  </div>

                  {/* Post Status Progress Bar */}
                  <div className="flex items-center gap-1.5 self-start md:self-auto bg-muted/40 p-1 rounded-xl">
                    <span
                      className={cn(
                        'text-[11px] font-semibold px-3 py-1 rounded-lg transition-all',
                        selectedPostDetail.postState === 'draft'
                          ? 'bg-amber-600 text-white shadow-sm'
                          : 'text-muted-foreground',
                      )}
                    >
                      Draft
                    </span>
                    <span className="text-muted-foreground text-xs font-semibold">→</span>
                    <span
                      className={cn(
                        'text-[11px] font-semibold px-3 py-1 rounded-lg transition-all',
                        selectedPostDetail.postState === 'scheduled'
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-muted-foreground',
                      )}
                    >
                      Scheduled
                    </span>
                    <span className="text-muted-foreground text-xs font-semibold">→</span>
                    <span
                      className={cn(
                        'text-[11px] font-semibold px-3 py-1 rounded-lg transition-all',
                        selectedPostDetail.postState === 'published'
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-muted-foreground',
                      )}
                    >
                      Published
                    </span>
                  </div>
                </div>

                {/* 2. Source Selection (Manual vs AI Product Generator) */}
                {selectedPostDetail.postState !== 'published' && (
                  <div className="border border-border/60 bg-muted/10 rounded-2xl p-4 space-y-4 shrink-0">
                    <div className="flex border-b border-border/40 pb-2">
                      <button
                        onClick={() => setSourceMode('write')}
                        className={cn(
                          'px-4 py-2 text-xs font-semibold border-b-2 transition-all -mb-[9px]',
                          sourceMode === 'write'
                            ? 'border-primary text-primary font-bold'
                            : 'border-transparent text-muted-foreground hover:text-foreground',
                        )}
                      >
                        ✏️ Write Manually
                      </button>
                      <button
                        onClick={() => setSourceMode('ai')}
                        className={cn(
                          'px-4 py-2 text-xs font-semibold border-b-2 transition-all -mb-[9px] flex items-center gap-1',
                          sourceMode === 'ai'
                            ? 'border-primary text-primary font-bold'
                             : 'border-transparent text-muted-foreground hover:text-foreground',
                        )}
                      >
                        <Sparkles className="h-3.5 w-3.5 text-primary" /> Auto-Generate from Product
                      </button>
                    </div>

                    {sourceMode === 'ai' && (
                      <div className="flex flex-col md:flex-row items-end gap-3 animate-in fade-in duration-200">
                        <div className="flex-1 w-full space-y-1">
                          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Select Product</label>
                          <Select
                            value={selectedProductId}
                            onChange={(e) => setSelectedProductId(e.target.value)}
                            className="bg-card"
                          >
                            {products.map((prod) => (
                              <option key={prod.id} value={prod.id}>
                                {prod.name} (${prod.price})
                              </option>
                            ))}
                          </Select>
                        </div>

                        <div className="w-full md:w-40 space-y-1">
                          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Marketing Tone</label>
                          <Select
                            value={selectedTone}
                            onChange={(e) => setSelectedTone(e.target.value)}
                            className="bg-card"
                          >
                            <option value="friendly">😊 Friendly</option>
                            <option value="professional">💼 Professional</option>
                            <option value="urgent">🔥 Urgent (FOMO)</option>
                            <option value="playful">🎉 Playful</option>
                          </Select>
                        </div>

                        <Button
                          type="button"
                          onClick={handleAIGenerate}
                          disabled={generating || products.length === 0}
                          className="w-full md:w-auto h-10 px-4 font-bold shrink-0"
                        >
                          {generating ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Sparkles className="h-4 w-4 mr-1.5" />
                          )}
                          Generate copy
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* 3. Post Content Editor */}
                <div className="space-y-2 flex-1 flex flex-col min-h-0">
                  <div className="flex justify-between items-center shrink-0">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Post Content</label>
                    <span
                      className={cn(
                        'text-xs font-medium',
                        isOverLimit ? 'text-destructive font-bold' : 'text-muted-foreground',
                      )}
                    >
                      {content.length.toLocaleString()} / {charLimit.toLocaleString()} chars
                    </span>
                  </div>

                  <Textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="What would you like to share with your audience? Fill manually or generate from a product using the tabs above..."
                    disabled={selectedPostDetail.postState === 'published'}
                    className="flex-1 min-h-[160px] md:min-h-[220px] resize-none text-sm p-4 bg-muted/5 leading-relaxed focus:bg-card focus:ring-primary/10 transition-all border-border/80"
                  />
                </div>

                {/* 4. Attached media grid & Upload */}
                <div className="space-y-3 shrink-0">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block">Attachments</label>
                  
                  <div className="flex flex-wrap items-center gap-3">
                    {/* Media Previews */}
                    {mediaUrls.map((url, idx) => (
                      <div
                        key={idx}
                        className="relative h-20 w-20 rounded-xl overflow-hidden border border-border shadow-sm group bg-muted"
                      >
                        <img src={url} alt="Post Attachment" className="h-full w-full object-cover" />
                        {selectedPostDetail.postState !== 'published' && (
                          <button
                            type="button"
                            onClick={() => handleRemoveImage(idx)}
                            className="absolute top-1 right-1 bg-black/60 hover:bg-red-600 text-white rounded-full p-1 transition-all"
                            title="Remove image"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ))}

                    {/* Upload new image button */}
                    {selectedPostDetail.postState !== 'published' && mediaUrls.length < 5 && (
                      <div className="h-20 w-20 rounded-xl border border-dashed border-border hover:border-primary/50 flex flex-col items-center justify-center p-2 text-center transition-all bg-muted/5 hover:bg-muted/10">
                        <ImageUpload
                          token={token}
                          businessId={businessId}
                          onUploaded={handleImageUploaded}
                        />
                      </div>
                    )}

                    {mediaUrls.length === 0 && (
                      <span className="text-xs text-muted-foreground italic">No image attached. Supports up to 5 attachments.</span>
                    )}
                  </div>
                </div>

                {/* 5. AI Tune Instruction Bar */}
                {selectedPostDetail.postState !== 'published' && (
                  <div className="border border-border/60 rounded-2xl bg-muted/5 p-4 space-y-2 shrink-0">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <Sparkles className="h-3.5 w-3.5 text-primary" /> Tune post draft with AI
                    </label>
                    <div className="flex gap-2">
                      <Input
                        value={aiInstruction}
                        onChange={(e) => setAiInstruction(e.target.value)}
                        placeholder='e.g. "make it more marketing friendly, add relevant tags and a call to action"'
                        disabled={tuning}
                        className="bg-card"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void handleAITune();
                        }}
                      />
                      <Button
                        type="button"
                        onClick={handleAITune}
                        disabled={tuning || !aiInstruction.trim()}
                        className="font-bold shrink-0"
                      >
                        {tuning ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          'Tune ✨'
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {/* 6. Settings & Post actions row */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-t border-border/40 pt-4 shrink-0">
                  {/* Scheduling block */}
                  <div className="flex items-center gap-3">
                    <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground block">
                        Schedule Publication
                      </label>
                      <Input
                        type="datetime-local"
                        value={scheduledAt}
                        onChange={(e) => setScheduledAt(e.target.value)}
                        disabled={selectedPostDetail.postState === 'published'}
                        className="h-8.5 text-xs w-48 bg-card"
                      />
                    </div>
                  </div>

                  {/* Actions buttons */}
                  <div className="flex items-center gap-2 self-end md:self-auto">
                    {selectedPostDetail.postState !== 'published' ? (
                      <>
                        <Button
                          variant="outline"
                          onClick={() => handleSavePost()}
                          disabled={saving}
                          className="rounded-lg h-10 font-bold"
                        >
                          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Draft'}
                        </Button>
                        
                        <Button
                          onClick={handlePublishPost}
                          disabled={publishing || isOverLimit}
                          className="rounded-lg h-10 font-bold bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                        >
                          {publishing ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                          Publish Now
                        </Button>
                      </>
                    ) : (
                      <Button
                        onClick={handleSyncStats}
                        disabled={syncing}
                        className="rounded-lg h-10 font-bold gap-1.5"
                      >
                        {syncing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Loader2 className="h-4 w-4" /> // or sync icon
                        )}
                        Sync Analytics
                      </Button>
                    )}
                  </div>
                </div>

                {/* 7. Published Post Stats strip */}
                {selectedPostDetail.postState === 'published' && (
                  <div className="bg-muted/10 border border-border/80 rounded-2xl p-5 shrink-0 space-y-3">
                    <div className="flex items-center justify-between border-b border-border/40 pb-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <BarChart2 className="h-4 w-4 text-primary" /> Performance Analytics
                      </h4>
                      <span className="text-[10px] text-muted-foreground">
                        Last synced:{' '}
                        {selectedPostDetail.latestSync
                          ? new Date(selectedPostDetail.latestSync.syncedAt).toLocaleTimeString()
                          : 'Never'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div className="bg-card rounded-xl p-3 border border-border/40 text-center">
                        <span className="text-[10px] font-bold text-muted-foreground block uppercase">Likes</span>
                        <span className="text-xl font-bold text-primary">
                          {selectedPostDetail.latestSync?.likeCount.toLocaleString() ?? 0}
                        </span>
                      </div>
                      <div className="bg-card rounded-xl p-3 border border-border/40 text-center">
                        <span className="text-[10px] font-bold text-muted-foreground block uppercase">Comments</span>
                        <span className="text-xl font-bold text-primary">
                          {selectedPostDetail.latestSync?.commentCount.toLocaleString() ?? 0}
                        </span>
                      </div>
                      <div className="bg-card rounded-xl p-3 border border-border/40 text-center">
                        <span className="text-[10px] font-bold text-muted-foreground block uppercase">Shares</span>
                        <span className="text-xl font-bold text-primary">
                          {selectedPostDetail.latestSync?.shareCount.toLocaleString() ?? 0}
                        </span>
                      </div>
                      <div className="bg-card rounded-xl p-3 border border-border/40 text-center">
                        <span className="text-[10px] font-bold text-muted-foreground block uppercase">Reach</span>
                        <span className="text-xl font-bold text-primary">
                          {selectedPostDetail.latestSync?.reachCount.toLocaleString() ?? 0}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground max-w-md mx-auto">
            <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center text-muted-foreground mb-4">
              <FileText className="h-6 w-6" />
            </div>
            <h3 className="font-bold text-sm text-foreground">No post selected</h3>
            <p className="text-xs mt-1">
              Select a post draft from the list on the left to edit, schedule or publish it. Or click "+ New Post" to start a new draft.
            </p>
          </div>
        )}
      </div>

    </div>
  );
}
