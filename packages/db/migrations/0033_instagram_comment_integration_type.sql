-- Instagram comment runs are their own integration in token analytics, distinct from DMs.
ALTER TYPE integration_type ADD VALUE IF NOT EXISTS 'instagram_comment';
