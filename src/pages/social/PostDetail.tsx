import { useParams } from 'react-router';
import { MessageSquareOff } from '@/components/icons';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { PostCard } from '@/components/posts/PostCard';
import { usePost } from '@/hooks/useOpenWeb';
import { usePostModeration } from '@/hooks/useSocialModeration';
import { useMeta } from '@/hooks/useMeta';

/** Single post permalink — target of Share, Atom feed entries and oEmbed.
 *  Like Bluesky, a direct link ignores list filters (mutes) but keeps media blur. */
export default function PostDetail() {
  const { postId } = useParams<{ postId: string }>();
  const { data: post, isLoading } = usePost(postId);
  const moderation = usePostModeration(post ? [post] : []);
  useMeta({ title: 'Post', noIndex: true });

  return (
    <PageContainer size="reading">
      {isLoading ? (
        <PageLoadingState count={1} variant="list" />
      ) : !post ? (
        <EmptyState
          icon={MessageSquareOff}
          title="Post not found"
          description="It may have been deleted or is not visible to you."
        />
      ) : (
        <PostCard post={post} moderation={moderation.get(post.id)} />
      )}
    </PageContainer>
  );
}
