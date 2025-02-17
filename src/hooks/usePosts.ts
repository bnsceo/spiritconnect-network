
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Post {
  id: string;
  title: string;
  content: string;
  created_at: string;
  user_id: string;
  attachment_urls: {
    url: string;
    type: string;
    name: string;
  }[];
  hashtags: string[];
  like_count: number;
  comment_count: number;
  profiles: {
    id: string;
    username: string;
    avatar_url: string | null;
  };
}

export const usePosts = () => {
  const queryClient = useQueryClient();

  const postsQuery = useQuery({
    queryKey: ['posts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('posts')
        .select(`
          *,
          profiles (
            id,
            username,
            avatar_url
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Transform the data to match our Post interface
      return (data as any[]).map(post => ({
        ...post,
        attachment_urls: Array.isArray(post.attachment_urls) ? post.attachment_urls : [],
        comment_count: 0 // Initialize with 0 since it's not in the database yet
      })) as Post[];
    },
  });

  const createPost = useMutation({
    mutationFn: async ({ title, content, hashtags, files }: { 
      title: string; 
      content: string; 
      hashtags: string[];
      files: File[];
    }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      // Upload files if any
      const attachment_urls = [];
      for (const file of files) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `posts/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('attachments')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('attachments')
          .getPublicUrl(filePath);

        attachment_urls.push({
          url: publicUrl,
          type: file.type,
          name: file.name
        });
      }

      // Create post with initial values
      const newPost = {
        title,
        content,
        hashtags,
        attachment_urls,
        user_id: session.user.id,
        like_count: 0
      };

      const { data, error } = await supabase
        .from('posts')
        .insert([newPost])
        .select(`
          *,
          profiles (
            id,
            username,
            avatar_url
          )
        `)
        .single();

      if (error) throw error;
      
      // Explicitly transform the returned data to match our Post interface
      return {
        id: data.id,
        title: data.title,
        content: data.content,
        created_at: data.created_at,
        user_id: data.user_id,
        attachment_urls: Array.isArray(data.attachment_urls) ? data.attachment_urls : [],
        hashtags: Array.isArray(data.hashtags) ? data.hashtags : [],
        like_count: data.like_count || 0,
        comment_count: 0, // Initialize with 0 since it's not in the database yet
        profiles: {
          id: data.profiles.id,
          username: data.profiles.username,
          avatar_url: data.profiles.avatar_url
        }
      } as Post;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
    },
  });

  return {
    ...postsQuery,
    createPost
  };
};
