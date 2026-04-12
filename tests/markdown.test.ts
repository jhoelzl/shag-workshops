import { describe, it, expect } from 'vitest';
import { simpleMarkdown } from '../src/lib/markdown';

describe('simpleMarkdown', () => {
  it('converts bold text', () => {
    expect(simpleMarkdown('**hello**')).toContain('<strong>hello</strong>');
  });

  it('converts italic text', () => {
    expect(simpleMarkdown('*hello*')).toContain('<em>hello</em>');
  });

  it('wraps plain text in <p> tags', () => {
    expect(simpleMarkdown('hello world')).toBe('<p class="mb-1">hello world</p>');
  });

  it('creates unordered list from - items', () => {
    const result = simpleMarkdown('- item 1\n- item 2');
    expect(result).toContain('<ul');
    expect(result).toContain('<li>item 1</li>');
    expect(result).toContain('<li>item 2</li>');
    expect(result).toContain('</ul>');
  });

  it('creates unordered list from * items', () => {
    const result = simpleMarkdown('* apples\n* bananas');
    expect(result).toContain('<li>apples</li>');
    expect(result).toContain('<li>bananas</li>');
  });

  it('escapes HTML entities to prevent XSS', () => {
    const result = simpleMarkdown('<script>alert("xss")</script>');
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });

  it('handles mixed content: text, bold, list', () => {
    const input = '**Title**\n- one\n- two\nSome text';
    const result = simpleMarkdown(input);
    expect(result).toContain('<strong>Title</strong>');
    expect(result).toContain('<li>one</li>');
    expect(result).toContain('<li>two</li>');
    expect(result).toContain('Some text');
  });

  it('skips empty lines without adding extra spacing', () => {
    const result = simpleMarkdown('line 1\n\nline 2');
    expect(result).toBe('<p class="mb-1">line 1</p><p class="mb-1">line 2</p>');
  });
});
