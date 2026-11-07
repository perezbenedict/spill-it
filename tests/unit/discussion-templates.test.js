import { describe, expect, it } from 'vitest';
import { DISCUSSION_TEMPLATES, templateSettings } from '../../lib/discussion-templates';

describe('discussion templates', () => {
  it('never changes session identity, status or schedule', () => {
    for (const template of DISCUSSION_TEMPLATES) {
      const settings = templateSettings(template);
      expect(settings).not.toHaveProperty('status');
      expect(settings).not.toHaveProperty('public_code');
      expect(settings).not.toHaveProperty('title');
      expect(settings).not.toHaveProperty('opens_at');
      expect(settings.available_categories.length).toBeGreaterThan(0);
      expect(settings.min_content_length).toBeLessThanOrEqual(settings.max_content_length);
    }
  });
});
