import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  getQuizzesControllerListQueryKey,
  useQuizzesControllerDuplicate,
} from '../api/generated/quizzes/quizzes';

/**
 * "Create from this": a copy of a quiz another host shares, made the caller's
 * own (private, a draft, no link to the original), opened in the editor.
 */
export function useCopyQuiz() {
  const duplicate = useQuizzesControllerDuplicate();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const copy = (id: string) =>
    duplicate.mutate(
      { id },
      {
        onSuccess: (res) => {
          void queryClient.invalidateQueries({ queryKey: getQuizzesControllerListQueryKey() });
          void navigate({ to: '/quizzes/$quizId', params: { quizId: res.data.id } });
        },
      },
    );
  return { copy, copying: duplicate.isPending, copyError: duplicate.error };
}
