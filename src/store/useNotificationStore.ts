import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from './useAuthStore';

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'warning' | 'info' | 'error' | 'success';
  isRead: boolean;
  createdAt: string;
}

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  /** P4: true once a fetch succeeded in this session (dedupe of daily-loss notifications). */
  notificationsLoaded: boolean;
  fetchNotifications: () => Promise<void>;
  addNotification: (notification: Omit<Notification, 'id' | 'createdAt' | 'userId' | 'isRead'>) => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  clearAll: () => Promise<void>;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  notificationsLoaded: false,

  fetchNotifications: async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    set({ isLoading: true });
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching notifications:', error);
    } else if (data) {
      const formattedNotifications: Notification[] = data.map(d => ({
        id: d.id,
        userId: d.user_id,
        title: d.title,
        message: d.message,
        type: d.type as 'warning' | 'info' | 'error' | 'success',
        isRead: d.is_read,
        createdAt: d.created_at,
      }));
      set({ 
        notifications: formattedNotifications,
        notificationsLoaded: true,
        unreadCount: formattedNotifications.filter(n => !n.isRead).length
      });
    }
    set({ isLoading: false });
  },

  addNotification: async (notification) => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    const { data, error } = await supabase
      .from('notifications')
      .insert([{
        user_id: user.id,
        title: notification.title,
        message: notification.message,
        type: notification.type
      }])
      .select()
      .single();

    if (error) {
      console.error('Error adding notification:', error);
      throw error;
    }

    if (data) {
      const newNotification: Notification = {
        id: data.id,
        userId: data.user_id,
        title: data.title,
        message: data.message,
        type: data.type as 'warning' | 'info' | 'error' | 'success',
        isRead: data.is_read,
        createdAt: data.created_at,
      };
      
      set(state => ({
        notifications: [newNotification, ...state.notifications],
        unreadCount: state.unreadCount + 1
      }));
    }
  },

  markAsRead: async (id) => {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id);

    if (error) {
      console.error('Error marking notification as read:', error);
      throw error;
    }

    set(state => {
      const updated = state.notifications.map(n => 
        n.id === id ? { ...n, isRead: true } : n
      );
      return {
        notifications: updated,
        unreadCount: updated.filter(n => !n.isRead).length
      };
    });
  },

  markAllAsRead: async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false);

    if (error) {
      console.error('Error marking all as read:', error);
      throw error;
    }

    set(state => ({
      notifications: state.notifications.map(n => ({ ...n, isRead: true })),
      unreadCount: 0
    }));
  },

  clearAll: async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('user_id', user.id);

    if (error) {
      console.error('Error clearing notifications:', error);
      throw error;
    }

    set({ notifications: [], unreadCount: 0 });
  }
}));
