import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

interface LlmStatus {
  providers: { anthropic?: boolean; deepseek?: boolean };
}

/**
 * 顶部小指示器：
 * - 绿点：后端 OK 且至少一个 LLM provider 配了 key
 * - 黄点：后端 OK 但没 LLM key（AI 调用会失败）
 * - 红点：后端无响应
 * 60s 一次轮询，避免烧后端。
 */
export function BackendStatus() {
  const health = useQuery({
    queryKey: ['health-llm'],
    queryFn: async () => {
      // 后端根路径返回 { status: 'ok' } —— 比 /storage/health 轻
      await api.get<{ status: string }>('/');
      const llm = await api.get<LlmStatus>('/llm/status');
      return llm;
    },
    refetchInterval: 60_000,
    retry: 0,
  });

  if (health.isLoading) {
    return <Dot color="bg-ink-mute" label="检测中…" />;
  }

  if (health.isError) {
    return <Dot color="bg-danger" label="后端无响应" title="试试：pnpm dev:server" />;
  }

  const providers = health.data?.providers ?? {};
  const hasKey = providers.anthropic || providers.deepseek;
  if (!hasKey) {
    return (
      <Dot
        color="bg-warning"
        label="无 LLM key"
        title="后端在跑，但没配 ANTHROPIC_API_KEY / DEEPSEEK_API_KEY，AI 功能会失败"
      />
    );
  }

  const labels: string[] = [];
  if (providers.anthropic) labels.push('anthropic');
  if (providers.deepseek) labels.push('deepseek');
  return <Dot color="bg-success" label={labels.join(' + ')} title="后端 + LLM 全就绪" />;
}

function Dot({ color, label, title }: { color: string; label: string; title?: string }) {
  return (
    <span
      title={title ?? label}
      className="inline-flex items-center gap-1.5 font-mono text-pixel-sm text-ink-soft"
    >
      <span className={`inline-block w-2 h-2 ${color} border border-outline`} />
      {label}
    </span>
  );
}
