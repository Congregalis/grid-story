import { useNavigate } from 'react-router-dom';
import { toast } from '../../lib/toast';
import { STAGES } from './definitions';
import { canEnterStage } from './navigator';
import type { StageContext, StageId } from './types';

interface StepperProps {
  bookId: string;
  currentStageId: StageId;
  ctx: StageContext;
}

export function Stepper({ bookId, currentStageId, ctx }: StepperProps) {
  const navigate = useNavigate();

  return (
    <ol className="flex items-stretch gap-0">
      {STAGES.map((stage, idx) => {
        const progress = stage.computeProgress(ctx);
        const isCurrent = stage.id === currentStageId;
        const enter = canEnterStage(stage.id, ctx);
        const disabled = !enter.allowed && !isCurrent;
        const showCheck = progress.done && !isCurrent;

        const tooltip = disabled
          ? `🔒 ${enter.reason}`
          : progress.blockers.length > 0
            ? progress.blockers.join(' / ')
            : isCurrent
              ? '当前阶段'
              : `进入 ${stage.label}`;

        const baseCls =
          'group relative flex flex-1 min-w-0 items-center gap-2 px-3 py-2 border-2 rounded-sm font-pixel text-pixel-sm transition-colors';
        const stateCls = disabled
          ? 'border-outline-soft bg-surface text-ink-mute opacity-50 cursor-not-allowed'
          : isCurrent
            ? 'border-primary bg-primary-soft text-primary shadow-pixel-1'
            : showCheck
              ? 'border-success bg-surface text-success hover:bg-surface-raised cursor-pointer'
              : 'border-outline bg-surface text-ink hover:bg-surface-raised cursor-pointer';

        return (
          <li key={stage.id} className="flex flex-1 min-w-0 items-center">
            <button
              type="button"
              disabled={disabled}
              title={tooltip}
              className={`${baseCls} ${stateCls}`}
              onClick={() => {
                if (isCurrent) return;
                if (disabled) {
                  toast.info(enter.reason ?? '该阶段尚未解锁');
                  return;
                }
                navigate(`/books/${bookId}/stages/${stage.route}`);
              }}
            >
              <span className="text-base leading-none flex-shrink-0">
                {disabled ? '🔒' : showCheck ? '✓' : stage.icon}
              </span>
              <span className="truncate">{stage.label}</span>
            </button>
            {idx < STAGES.length - 1 && (
              <span
                aria-hidden
                className="flex-shrink-0 mx-1 h-0.5 w-3 bg-outline-soft"
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
