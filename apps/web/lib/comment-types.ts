/** The Page can only like or remove its like from a comment. */
export type CommentReaction = 'LIKE';

/**
 * Shape of a top-level Facebook comment (and its replies) returned to the UI.
 * Using the Facebook comment id as the "thread" identifier so no DB lookup is
 * needed just to browse comments.
 */
export type LiveCommentThread = {
  /** The Facebook top-level comment id — used as the thread key in the UI. */
  id: string;
  /** Facebook user id of the top-level commenter (not the comment id, not the page). */
  commenterPlatformId: string | null;
  commenterName: string | null;
  commenterAvatar: string | null;
  /** The top-level (parent) comment. */
  comment: {
    externalId: string;
    content: string;
    time: string;
    from: 'customer';
    likeCount: number;
    /** Whether the Page (viewer token) currently likes/reacts to this comment. */
    userLikes: boolean;
  };
  /** Replies to the top-level comment (from page or agent). */
  replies: Array<{
    id: string;
    externalId: string;
    content: string;
    time: string;
    /** 'self' = page/agent reply; 'customer' = commenter's own follow-up reply */
    from: 'self' | 'customer';
    commenterPlatformId: string | null;
    commenterName: string | null;
    likeCount: number;
    userLikes: boolean;
  }>;
};
