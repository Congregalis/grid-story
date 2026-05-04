import { type WikiFrontmatter, wikiFrontmatterSchema } from '@grid-story/schema';
import matter from 'gray-matter';

const VAR_RE = /\{\{(\w+)\}\}/g;

export interface ParsedWikiPage {
  frontmatter: Record<string, unknown>;
  content: string;
  raw: string;
}

export interface WikiPageValidation {
  ok: boolean;
  frontmatter?: WikiFrontmatter;
  issues: string[];
}

export class WikiSchema {
  renderTemplate(
    template: string,
    vars: Record<string, string | number | null | undefined>,
  ): string {
    return template.replace(VAR_RE, (_, name: string) => {
      const value = vars[name];
      return value === undefined || value === null ? `{{${name}}}` : String(value);
    });
  }

  parseFrontmatter(raw: string): ParsedWikiPage {
    const parsed = matter(raw);
    return {
      frontmatter: parsed.data,
      content: parsed.content,
      raw,
    };
  }

  validatePage(raw: string): WikiPageValidation {
    const parsed = this.parseFrontmatter(raw);
    const result = wikiFrontmatterSchema.safeParse(parsed.frontmatter);
    if (result.success) {
      return { ok: true, frontmatter: result.data, issues: [] };
    }

    return {
      ok: false,
      issues: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    };
  }
}
