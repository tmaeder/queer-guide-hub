/**
 * useCMSComments - Review comments hook
 * CRUD for threaded review/approval comments on content items.
 */

import { useState, useCallback } from 'react';
import { api } from '@/integrations/api/client';
import { useAuth } from '@/hooks/useAuth';
import type { CMSReviewComment, CommentType } from '@/types/cms';

interface UseCMSCommentsReturn {
  comments: CMSReviewComment[];
  loading: boolean;
  error: string | null;
  /** Load comments for a content item */
  loadComments: (sourceTable: string, sourceId: string) => Promise<void>;
  /** Add a comment */
  addComment: (
    sourceTable: string,
    sourceId: string,
    body: string,
    type?: CommentType,
    parentId?: string,
  ) => Promise<boolean>;
  /** Resolve a comment */
  resolveComment: (commentId: string) => Promise<boolean>;
  /** Unresolve a comment */
  unresolveComment: (commentId: string) => Promise<boolean>;
}

export function useCMSComments(): UseCMSCommentsReturn {
  const { user } = useAuth();
  const [comments, setComments] = useState<CMSReviewComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadComments = useCallback(async (sourceTable: string, sourceId: string) => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('cms_review_comments' as any)
        .select('*')
        .eq('source_table', sourceTable)
        .eq('source_id', sourceId)
        .order('created_at', { ascending: true });

      if (fetchError) throw fetchError;

      // Resolve author info
      const actorIds = [...new Set((data || []).filter((c: any) => c.created_by).map((c: any) => c.created_by))];
      let profileMap = new Map<string, { display_name?: string; email?: string }>();

      if (actorIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles' as any)
          .select('id, display_name, email')
          .in('id', actorIds);

        profileMap = new Map(
          (profiles || []).map((p: any) => [p.id, { display_name: p.display_name, email: p.email }])
        );
      }

      // Build threaded structure
      const allComments = (data || []).map((c: any) => ({
        ...c,
        author: c.created_by ? profileMap.get(c.created_by) : undefined,
        replies: [],
      })) as CMSReviewComment[];

      // Organize into tree
      const topLevel: CMSReviewComment[] = [];
      const byId = new Map<string, CMSReviewComment>();
      allComments.forEach(c => byId.set(c.id, c));

      allComments.forEach(c => {
        if (c.parent_comment_id && byId.has(c.parent_comment_id)) {
          const parent = byId.get(c.parent_comment_id)!;
          if (!parent.replies) parent.replies = [];
          parent.replies.push(c);
        } else {
          topLevel.push(c);
        }
      });

      setComments(topLevel);
    } catch (err) {
      console.error('Error loading comments:', err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const addComment = useCallback(async (
    sourceTable: string,
    sourceId: string,
    body: string,
    type: CommentType = 'comment',
    parentId?: string,
  ): Promise<boolean> => {
    if (!user || !body.trim()) return false;

    try {
      const { error: insertError } = await supabase
        .from('cms_review_comments' as any)
        .insert({
          source_table: sourceTable,
          source_id: sourceId,
          body: body.trim(),
          comment_type: type,
          parent_comment_id: parentId || null,
          created_by: user.id,
        });

      if (insertError) throw insertError;

      // Reload comments
      await loadComments(sourceTable, sourceId);
      return true;
    } catch (err) {
      console.error('Error adding comment:', err);
      setError((err as Error).message);
      return false;
    }
  }, [user, loadComments]);

  const resolveComment = useCallback(async (commentId: string): Promise<boolean> => {
    if (!user) return false;

    try {
      const { error: updateError } = await supabase
        .from('cms_review_comments' as any)
        .update({
          resolved: true,
          resolved_by: user.id,
          resolved_at: new Date().toISOString(),
        })
        .eq('id', commentId);

      if (updateError) throw updateError;

      setComments(prev => updateCommentResolved(prev, commentId, true, user.id));
      return true;
    } catch (err) {
      console.error('Error resolving comment:', err);
      return false;
    }
  }, [user]);

  const unresolveComment = useCallback(async (commentId: string): Promise<boolean> => {
    try {
      const { error: updateError } = await supabase
        .from('cms_review_comments' as any)
        .update({
          resolved: false,
          resolved_by: null,
          resolved_at: null,
        })
        .eq('id', commentId);

      if (updateError) throw updateError;

      setComments(prev => updateCommentResolved(prev, commentId, false, null));
      return true;
    } catch (err) {
      console.error('Error unresolving comment:', err);
      return false;
    }
  }, []);

  return {
    comments,
    loading,
    error,
    loadComments,
    addComment,
    resolveComment,
    unresolveComment,
  };
}

// Helper to update resolved state in nested tree
function updateCommentResolved(
  comments: CMSReviewComment[],
  id: string,
  resolved: boolean,
  resolvedBy: string | null,
): CMSReviewComment[] {
  return comments.map(c => {
    if (c.id === id) {
      return { ...c, resolved, resolved_by: resolvedBy, resolved_at: resolved ? new Date().toISOString() : undefined };
    }
    if (c.replies?.length) {
      return { ...c, replies: updateCommentResolved(c.replies, id, resolved, resolvedBy) };
    }
    return c;
  });
}
