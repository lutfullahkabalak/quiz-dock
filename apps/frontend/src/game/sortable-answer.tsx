import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { PublicOption } from '@quiz-dock/contracts';
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { COLOR_TEXT } from '@/lib/option-style';
import { cn } from '@/lib/utils';
import { ShapeIcon } from '@/components/shape-icon';

/**
 * Participant's ordering answer: drag and drop (pointer, touch, keyboard) with
 * the up/down arrows kept as a fallback — both change the same order.
 */
export function SortableAnswer({
  options,
  order,
  onChange,
}: {
  options: PublicOption[];
  order: string[];
  onChange: (next: string[]) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = order.indexOf(String(active.id));
    const to = order.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onChange(arrayMove(order, from, to));
  };
  const move = (i: number, dir: -1 | 1) => {
    const target = i + dir;
    if (target < 0 || target >= order.length) return;
    onChange(arrayMove(order, i, target));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        <ul className="flex w-full flex-col gap-[0.5em]">
          {order.map((id, i) => {
            const o = options.find((x) => x.id === id);
            return o ? (
              <SortableRow
                key={id}
                option={o}
                index={i}
                last={i === order.length - 1}
                onMove={(dir) => move(i, dir)}
              />
            ) : null;
          })}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({
  option,
  index,
  last,
  onMove,
}: {
  option: PublicOption;
  index: number;
  last: boolean;
  onMove: (dir: -1 | 1) => void;
}) {
  const { t } = useTranslation('live');
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: option.id,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'bg-card flex touch-none items-center gap-[0.5em] rounded-[0.6em] border px-[0.5em] py-[0.5em] select-none',
        isDragging && 'z-10 shadow-lg ring-2 ring-primary/40',
      )}
    >
      <button
        type="button"
        className="text-muted-foreground cursor-grab touch-none rounded p-[0.25em] active:cursor-grabbing"
        aria-label={t('player.dragToReorder')}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-[1.25em]" />
      </button>
      <span className="text-muted-foreground w-[1.5em] tabular-nums">{index + 1}.</span>
      <span aria-hidden className={cn('text-[1.1em] leading-none', COLOR_TEXT[option.color])}>
        <ShapeIcon shape={option.shape} />
      </span>
      <span className="min-w-0 flex-1 text-left">{option.text ?? option.color}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8"
        aria-label={t('player.moveUp')}
        disabled={index === 0}
        onClick={() => onMove(-1)}
      >
        <ArrowUp className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8"
        aria-label={t('player.moveDown')}
        disabled={last}
        onClick={() => onMove(1)}
      >
        <ArrowDown className="size-4" />
      </Button>
    </li>
  );
}
