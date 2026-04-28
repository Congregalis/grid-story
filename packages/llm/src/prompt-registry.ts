import { readFile, readdir } from 'node:fs/promises';
import { join, basename } from 'node:path';

export interface TemplateInfo {
  agent: string;
  task: string;
  versions: number[];
}

interface Template {
  agent: string;
  task: string;
  version: number;
  content: string;
}

const VAR_RE = /\{\{(\w+)\}\}/g;

export class PromptRegistry {
  private templates = new Map<string, Template[]>();

  constructor(private templatesDir: string) {}

  /** Scan templatesDir and load all .v<N>.md files into memory. */
  async loadAll(): Promise<void> {
    this.templates.clear();
    const agents = await readdir(this.templatesDir, { withFileTypes: true });
    for (const agentDir of agents) {
      if (!agentDir.isDirectory()) continue;
      const files = await readdir(join(this.templatesDir, agentDir.name));
      for (const file of files) {
        const m = file.match(/^(.+)\.v(\d+)\.md$/);
        if (!m) continue;
        const [, task, versionStr] = m;
        const content = await readFile(
          join(this.templatesDir, agentDir.name, file),
          'utf-8',
        );
        const entry: Template = {
          agent: agentDir.name,
          task,
          version: Number(versionStr),
          content,
        };
        const key = `${agentDir.name}/${task}`;
        const existing = this.templates.get(key) ?? [];
        existing.push(entry);
        this.templates.set(key, existing);
      }
    }
  }

  /** List all available templates with their versions. */
  list(): TemplateInfo[] {
    const result: TemplateInfo[] = [];
    for (const [key, tmpls] of this.templates) {
      const [agent, task] = key.split('/');
      result.push({ agent, task, versions: tmpls.map((t) => t.version).sort() });
    }
    return result;
  }

  /** Get the latest version of a template. Omit `version` to get the latest. */
  get(agent: string, task: string, version?: number): string {
    const templates = this.templates.get(`${agent}/${task}`);
    if (!templates || templates.length === 0) {
      throw new Error(`Template not found: ${agent}/${task}`);
    }
    if (version) {
      const tmpl = templates.find((t) => t.version === version);
      if (!tmpl) throw new Error(`Version ${version} not found for ${agent}/${task}`);
      return tmpl.content;
    }
    const latest = templates.reduce((a, b) => (a.version > b.version ? a : b));
    return latest.content;
  }

  /** Render a template by replacing {{var}} placeholders. */
  render(agent: string, task: string, vars: Record<string, string>, version?: number): string {
    const content = this.get(agent, task, version);
    return content.replace(VAR_RE, (_, name) => vars[name] ?? `{{${name}}}`);
  }
}
