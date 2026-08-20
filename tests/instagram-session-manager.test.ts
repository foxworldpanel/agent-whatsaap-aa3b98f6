import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InstagramSessionManager } from './instagram-session-manager';
import { PlaywrightSessionService } from './playwright-session.service';
import { supabase } from '@/integrations/supabase/client';

// Mock Supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(() => ({
      upsert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(),
      })),
      select: vi.fn(() => ({
        eq: vi.fn(),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(),
      })),
    })),
  },
}));

// Mock PlaywrightSessionService
vi.mock('./playwright-session.service', () => ({
  PlaywrightSessionService: {
    openLoginFlow: vi.fn(),
    validateSession: vi.fn(),
  },
}));

// Mock SessionStorageService
vi.mock('./session-storage.service', () => ({
  SessionStorageService: {
    getStoragePath: vi.fn((id) => `/tmp/instagram-sessions/${id}.json`),
    saveSession: vi.fn(),
    removeSession: vi.fn(),
    loadSession: vi.fn(),
    exists: vi.fn(),
  },
}));

describe('InstagramSessionManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(InstagramSessionManager).toBeDefined();
  });

  describe('connect', () => {
    it('should handle successful login', async () => {
      const mockResult = {
        success: true,
        username: 'testuser',
        display_name: 'Test User',
        profile_picture: 'http://example.com/pic.jpg',
        storageState: { cookies: [] }
      };
      
      (PlaywrightSessionService.openLoginFlow as any).mockResolvedValue(mockResult);
      (supabase.auth.getUser as any).mockResolvedValue({ data: { user: { id: 'user-123' } } });
      
      const mockUpsert = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'cred-123', username: 'testuser' }, error: null })
        })
      });
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'lead_finder_credentials') {
          return {
            upsert: mockUpsert,
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
            select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) })
          };
        }
        return {};
      });

      // Mock validate to return connected
      vi.spyOn(InstagramSessionManager, 'validate').mockResolvedValue('connected');

      const result = await InstagramSessionManager.connect();
      
      expect(result).toBeDefined();
      expect(PlaywrightSessionService.openLoginFlow).toHaveBeenCalled();
      expect(mockUpsert).toHaveBeenCalled();
    });

    it('should handle failed login', async () => {
      (PlaywrightSessionService.openLoginFlow as any).mockResolvedValue({ success: false, error: 'Login failed' });
      
      const result = await InstagramSessionManager.connect();
      
      expect(result).toBeNull();
    });
  });
});
