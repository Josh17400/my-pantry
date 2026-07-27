import { Link } from 'react-router-dom';

import { Card } from '../../ui/Card';
import { cn } from '../../ui/cn';
import { PlaceholderThumb } from '../../ui/PlaceholderThumb';
import type { TintName } from '../../ui/tokens';
import { totalMinutes } from './mappers';

export type RecipeCardModel = {
  id: string;
  title: string;
  servings: number;
  prepMin: number | null;
  cookMin: number | null;
  imageUrl: string | null;
  canMakeNow?: boolean;
};

const TINTS: TintName[] = ['cream', 'sage', 'tan', 'sky'];

type RecipeCardProps = {
  recipe: RecipeCardModel;
  className?: string;
};

export function RecipeCard({ recipe, className }: RecipeCardProps) {
  const mins = totalMinutes(recipe.prepMin, recipe.cookMin);
  const tint = TINTS[recipe.title.length % TINTS.length] ?? 'cream';

  return (
    <Link
      to={`/recipes/${recipe.id}`}
      data-testid="recipe-card"
      data-recipe-id={recipe.id}
      className={cn(
        'block min-h-tap rounded-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        className,
      )}
    >
      <Card
        padding="sm"
        className="flex h-full flex-col overflow-hidden transition-shadow hover:shadow-md"
      >
        <div className="relative mb-3 overflow-hidden rounded-2xl">
          {recipe.imageUrl ? (
            <img
              src={recipe.imageUrl}
              alt=""
              className="aspect-[4/3] w-full object-cover"
            />
          ) : (
            <div className="flex aspect-[4/3] w-full items-center justify-center">
              <PlaceholderThumb name={recipe.title} tint={tint} size="lg" />
            </div>
          )}
          {recipe.canMakeNow ? (
            <span className="absolute left-2 top-2 rounded-pill bg-fresh px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              Can make
            </span>
          ) : null}
        </div>
        <h3 className="line-clamp-2 font-display text-base font-semibold leading-snug text-ink">
          {recipe.title}
        </h3>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-muted">
          {mins != null ? (
            <span className="inline-flex items-center gap-1">
              <ClockIcon />
              {mins} min
            </span>
          ) : null}
          <span>{recipe.servings} servings</span>
        </div>
      </Card>
    </Link>
  );
}

function ClockIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden
    >
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.5V8l2.5 1.5" strokeLinecap="round" />
    </svg>
  );
}
