-- A conversation can have at most one active Welcome Funnel execution. Historical
-- duplicate running rows are intrinsically ambiguous, so quarantine every member
-- of such a duplicate set before installing the structural invariant.
--
-- Hold writers across cleanup + index installation. Without this migration-level
-- fence a concurrent start could insert another running row after cleanup but
-- before CREATE UNIQUE INDEX and make the safety migration fail nondeterministically.
BEGIN;

LOCK TABLE public.welcome_funnel_execution_state IN SHARE ROW EXCLUSIVE MODE;

WITH duplicate_conversations AS (
  SELECT conversation_id
  FROM public.welcome_funnel_execution_state
  WHERE status='running'
  GROUP BY conversation_id
  HAVING count(*)>1
)
UPDATE public.welcome_funnel_execution_state s
SET status='needs_review',
    error_message='multiple concurrent Welcome Funnel executions detected during safety migration',
    completed_at=NULL,
    updated_at=now()
FROM duplicate_conversations d
WHERE s.conversation_id=d.conversation_id
  AND s.status='running';

CREATE UNIQUE INDEX IF NOT EXISTS welcome_funnel_execution_one_running_per_conversation
ON public.welcome_funnel_execution_state(conversation_id)
WHERE status='running';

COMMIT;
