import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

interface LlmStatus {
  providers: { anthropic?: boolean; deepseek?: boolean };
}

/**
 * 顶部小指示器：
 * - 绿点：服务与 AI 可用
 * - 黄点：服务可用但 AI 不可用
 * - 红点：服务不可用
 * 60s 一次轮询，避免频繁打健康检查。
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
    return <Dot color="bg-danger" label="服务暂不可用" title="请稍后重试" />;
  }

  const providers = health.data?.providers ?? {};
  const hasKey = providers.anthropic || providers.deepseek;
  if (!hasKey) {
    return <Dot color="bg-warning" label="AI 未就绪" title="写作生成功能暂不可用" />;
  }

  return <Dot color="bg-success" label="AI 已就绪" title="服务与 AI 功能可用" />;
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
