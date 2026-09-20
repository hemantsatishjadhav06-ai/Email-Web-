import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import type { MailwaveAnalyticsConfig } from './types';

describe('Mailwave Analytics SDK - Global Config Pattern', () => {
  // Store original window.MailwaveAnalyticsConfig
  let originalConfig: MailwaveAnalyticsConfig | undefined;

  beforeEach(() => {
    // Save original
    originalConfig = window.MailwaveAnalyticsConfig;
    // Reset modules to allow fresh import. A real page load starts with a clean
    // window, so the install marker has to go too — otherwise every later import
    // aliases the first instance, which is exactly what the guard is for.
    delete (window as unknown as Record<string, unknown>).__mailwaveAnalytics;
    vi.resetModules();
  });

  afterEach(() => {
    // Restore original
    if (originalConfig !== undefined) {
      window.MailwaveAnalyticsConfig = originalConfig;
    } else {
      delete window.MailwaveAnalyticsConfig;
    }
    vi.resetModules();
  });

  describe('double install (W0.1)', () => {
    it('a second evaluation aliases the first instead of racing it', async () => {
      // The bundle is served at both /na.js and /na.<hash>.js, and the README
      // recommends the hashed URL — so "legacy hardcoded tag plus a GTM tag" is
      // an ordinary mid-migration state. Two live instances share one session id,
      // one nf_session_state key and one tab_id, so they clobber each other's
      // actions and their seq counters collide; tab_id cannot separate them
      // because sessionStorage is per-tab, not per-instance.
      window.MailwaveAnalyticsConfig = {
        workspace_id: 'test-ws',
        endpoint: 'https://api.example.com',
      };

      const first = (await import('./index')).default;
      vi.resetModules();
      const second = (await import('./index')).default;

      // Identity, not merely equivalence: the UMD wrapper assigns
      // window.MailwaveAnalytics from the default export, so returning a fresh
      // object would leave the global pointing at a dead second instance and
      // every later trackGoal() would land there.
      expect(second).toBe(first);
    });

    it('warns so a duplicated tag is discoverable', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      window.MailwaveAnalyticsConfig = {
        workspace_id: 'test-ws',
        endpoint: 'https://api.example.com',
      };

      await import('./index');
      vi.resetModules();
      await import('./index');

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('already loaded'));
      warn.mockRestore();
    });
  });

  describe('initialization', () => {
    it('should auto-initialize from window.MailwaveAnalyticsConfig', async () => {
      // Set global config before SDK loads
      window.MailwaveAnalyticsConfig = {
        workspace_id: 'test-ws',
        endpoint: 'https://test.com',
      };

      // Dynamically import the SDK
      const { default: MailwaveAnalytics } = await import('./index');

      // Verify SDK exports the API
      expect(typeof MailwaveAnalytics.trackGoal).toBe('function');
      expect(typeof MailwaveAnalytics.getSessionId).toBe('function');
      expect(typeof MailwaveAnalytics.debug).toBe('function');
    });

    it('should handle missing config gracefully on import', async () => {
      // No config set
      delete window.MailwaveAnalyticsConfig;

      // Should not throw on import
      const { default: MailwaveAnalytics } = await import('./index');

      expect(typeof MailwaveAnalytics.trackGoal).toBe('function');
    });

    it('should have init method on public API', async () => {
      window.MailwaveAnalyticsConfig = {
        workspace_id: 'test-ws',
        endpoint: 'https://test.com',
      };

      const { default: MailwaveAnalytics } = await import('./index');

      // init should exist on the public API
      expect(typeof MailwaveAnalytics.init).toBe('function');
    });

    it('init should be idempotent (calling twice returns same promise)', async () => {
      delete window.MailwaveAnalyticsConfig;

      const { default: MailwaveAnalytics } = await import('./index');

      const config = {
        workspace_id: 'test-ws',
        endpoint: 'https://test.com',
      };

      // Call init twice
      const promise1 = MailwaveAnalytics.init(config);
      const promise2 = MailwaveAnalytics.init(config);

      // Should return the same promise (or both resolve without error)
      await expect(promise1).resolves.toBeUndefined();
      await expect(promise2).resolves.toBeUndefined();

      // Config should be set
      expect(MailwaveAnalytics.getConfig()).not.toBeNull();
      expect(MailwaveAnalytics.getConfig()?.workspace_id).toBe('test-ws');
    });
  });

  describe('error handling', () => {
    it('should throw when calling methods without config', async () => {
      // No config set
      delete window.MailwaveAnalyticsConfig;

      const { default: MailwaveAnalytics } = await import('./index');

      // Calling a method should throw
      await expect(MailwaveAnalytics.getSessionId()).rejects.toThrow(
        'Mailwave Analytics not configured'
      );
    });

    it('should throw for trackGoal without config', async () => {
      delete window.MailwaveAnalyticsConfig;

      const { default: MailwaveAnalytics } = await import('./index');

      await expect(
        MailwaveAnalytics.trackGoal({ action: 'test', type: 'other' }),
      ).rejects.toThrow(
        'Mailwave Analytics not configured'
      );
    });

    it('should throw for trackPageView without config', async () => {
      delete window.MailwaveAnalyticsConfig;

      const { default: MailwaveAnalytics } = await import('./index');

      await expect(MailwaveAnalytics.trackPageView()).rejects.toThrow(
        'Mailwave Analytics not configured'
      );
    });

    it('should throw for setDimension without config', async () => {
      delete window.MailwaveAnalyticsConfig;

      const { default: MailwaveAnalytics } = await import('./index');

      await expect(MailwaveAnalytics.setDimension(1, 'test')).rejects.toThrow(
        'Mailwave Analytics not configured'
      );
    });
  });

  describe('async API', () => {
    it('should return Promise from getSessionId', async () => {
      window.MailwaveAnalyticsConfig = {
        workspace_id: 'test-ws',
        endpoint: 'https://test.com',
      };

      const { default: MailwaveAnalytics } = await import('./index');

      const result = MailwaveAnalytics.getSessionId();
      expect(result).toBeInstanceOf(Promise);
    });

    it('should return Promise from trackGoal', async () => {
      window.MailwaveAnalyticsConfig = {
        workspace_id: 'test-ws',
        endpoint: 'https://test.com',
      };

      const { default: MailwaveAnalytics } = await import('./index');

      const result = MailwaveAnalytics.trackGoal({ action: 'test', type: 'other' });
      expect(result).toBeInstanceOf(Promise);
    });

    it('should return Promise from getDimension', async () => {
      window.MailwaveAnalyticsConfig = {
        workspace_id: 'test-ws',
        endpoint: 'https://test.com',
      };

      const { default: MailwaveAnalytics } = await import('./index');

      const result = MailwaveAnalytics.getDimension(1);
      expect(result).toBeInstanceOf(Promise);
    });
  });

  describe('sync methods', () => {
    it('getConfig should return null when not initialized', async () => {
      delete window.MailwaveAnalyticsConfig;

      const { default: MailwaveAnalytics } = await import('./index');

      // getConfig is sync and returns null if not initialized
      expect(MailwaveAnalytics.getConfig()).toBeNull();
    });

    it('debug should return partial info when not initialized', async () => {
      delete window.MailwaveAnalyticsConfig;

      const { default: MailwaveAnalytics } = await import('./index');

      // debug is sync
      const debugInfo = MailwaveAnalytics.debug();
      expect(debugInfo).toBeDefined();
      expect(debugInfo.session).toBeNull();
      expect(debugInfo.config).toBeNull();
    });
  });

  describe('type exports', () => {
    it('should export types correctly', async () => {
      const types = await import('./index');

      // Should export type definitions (they exist at compile time)
      expect(types.default).toBeDefined();
    });
  });

  describe('config validation', () => {
    it('should throw when workspace_id is missing', async () => {
      window.MailwaveAnalyticsConfig = {
        workspace_id: '',
        endpoint: 'https://test.com',
      };

      const { default: MailwaveAnalytics } = await import('./index');

      // The init will fail, so calling a method should throw
      await expect(MailwaveAnalytics.getSessionId()).rejects.toThrow('workspace_id is required');
    });

    it('should throw when endpoint is missing', async () => {
      window.MailwaveAnalyticsConfig = {
        workspace_id: 'test-ws',
        endpoint: '',
      };

      const { default: MailwaveAnalytics } = await import('./index');

      await expect(MailwaveAnalytics.getSessionId()).rejects.toThrow('endpoint is required');
    });
  });
});
