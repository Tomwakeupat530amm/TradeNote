import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from './useAuthStore';
import { compressScreenshot } from '@/lib/imageCompressor';
import { pathFromLegacyUrl } from '@/lib/screenshotStorage';

export interface Playbook {
  id: string;
  userId: string;
  title: string;
  description: string;
  rules: string[];
  /** Stored value of playbooks.image_url (legacy public-URL format; kept for rollback compatibility). */
  imageUrl?: string;
  /** Storage path derived from imageUrl (client-side only; no DB column). Display uses a signed URL. */
  imagePath?: string;
  createdAt: string;
}

interface PlaybookState {
  playbooks: Playbook[];
  isLoading: boolean;
  fetchPlaybooks: () => Promise<void>;
  addPlaybook: (playbook: Omit<Playbook, 'id' | 'userId' | 'createdAt'> & { imageFile?: File | Blob | string }) => Promise<void>;
  updatePlaybook: (id: string, updates: Partial<Omit<Playbook, 'id' | 'userId' | 'createdAt'>> & { imageFile?: File | Blob | string | null }) => Promise<void>;
  deletePlaybook: (id: string) => Promise<void>;
}

export const usePlaybookStore = create<PlaybookState>((set, get) => ({
  playbooks: [],
  isLoading: false,

  fetchPlaybooks: async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    set({ isLoading: true });
    const { data, error } = await supabase
      .from('playbooks')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching playbooks:', error);
    } else if (data) {
      const formattedPlaybooks: Playbook[] = data.map(d => ({
        id: d.id,
        userId: d.user_id,
        title: d.title,
        description: d.description || '',
        rules: d.rules || [],
        imageUrl: d.image_url,
        imagePath: pathFromLegacyUrl(d.image_url) ?? undefined,
        createdAt: d.created_at,
      }));
      set({ playbooks: formattedPlaybooks });
    }
    set({ isLoading: false });
  },

  addPlaybook: async (playbook) => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    let finalImageUrl = playbook.imageUrl;

    if (playbook.imageFile && typeof playbook.imageFile === 'string' && playbook.imageFile.startsWith('data:image')) {
      const compressed = await compressScreenshot(playbook.imageFile);
      const filename = `${user.id}/playbook_${Date.now()}.${compressed.extension}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('trade-screenshots')
        .upload(filename, compressed.blob, {
          contentType: compressed.contentType,
          upsert: true
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
      } else if (uploadData) {
        const { data: publicUrlData } = supabase.storage
          .from('trade-screenshots')
          .getPublicUrl(filename);
        finalImageUrl = publicUrlData.publicUrl;
      }
    }

    const { data, error } = await supabase
      .from('playbooks')
      .insert([{
        user_id: user.id,
        title: playbook.title,
        description: playbook.description,
        rules: playbook.rules,
        image_url: finalImageUrl
      }])
      .select()
      .single();

    if (error) {
      console.error('Error adding playbook:', error);
      throw error;
    }

    if (data) {
      const newPlaybook: Playbook = {
        id: data.id,
        userId: data.user_id,
        title: data.title,
        description: data.description || '',
        rules: data.rules || [],
        imageUrl: data.image_url,
        imagePath: pathFromLegacyUrl(data.image_url) ?? undefined,
        createdAt: data.created_at,
      };
      
      set(state => ({ playbooks: [newPlaybook, ...state.playbooks] }));
    }
  },

  updatePlaybook: async (id, updates) => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    let finalImageUrl = updates.imageUrl;

    if (updates.imageFile && typeof updates.imageFile === 'string' && updates.imageFile.startsWith('data:image')) {
      const compressed = await compressScreenshot(updates.imageFile);
      const filename = `${user.id}/playbook_${Date.now()}.${compressed.extension}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('trade-screenshots')
        .upload(filename, compressed.blob, {
          contentType: compressed.contentType,
          upsert: true
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
      } else if (uploadData) {
        const { data: publicUrlData } = supabase.storage
          .from('trade-screenshots')
          .getPublicUrl(filename);
        finalImageUrl = publicUrlData.publicUrl;
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: any = {};
    if (updates.title !== undefined) payload.title = updates.title;
    if (updates.description !== undefined) payload.description = updates.description;
    if (updates.rules !== undefined) payload.rules = updates.rules;
    
    if (updates.imageFile === null) {
      payload.image_url = null;
    } else if (finalImageUrl !== undefined) {
      payload.image_url = finalImageUrl;
    }

    const { error } = await supabase
      .from('playbooks')
      .update(payload)
      .eq('id', id);

    if (error) {
      console.error('Error updating playbook:', error);
      throw error;
    }

    set(state => ({
      playbooks: state.playbooks.map(p => 
        p.id === id 
          ? {
              ...p,
              ...updates,
              imageUrl: payload.hasOwnProperty('image_url') ? (payload.image_url === null ? undefined : payload.image_url) : p.imageUrl,
              imagePath: payload.hasOwnProperty('image_url') ? (pathFromLegacyUrl(payload.image_url) ?? undefined) : p.imagePath
            }
          : p
      )
    }));
  },

  deletePlaybook: async (id) => {
    const playbookToDelete = get().playbooks.find(p => p.id === id);
    const storagePath = playbookToDelete
      ? (playbookToDelete.imagePath ?? pathFromLegacyUrl(playbookToDelete.imageUrl))
      : null;
    if (storagePath) {
      try {
        await supabase.storage.from('trade-screenshots').remove([storagePath]);
      } catch (storageErr) {
        console.warn('Could not remove playbook image from storage:', storageErr);
      }
    }

    const { error } = await supabase
      .from('playbooks')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting playbook:', error);
      throw error;
    }

    set(state => ({
      playbooks: state.playbooks.filter(p => p.id !== id)
    }));
  }
}));
