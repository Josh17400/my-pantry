/**
 * Community recipes route — public browse / fork / report.
 */

import { useMemo } from 'react';

import type { RecipeDetail } from '../db/types';
import { CommunityScreen } from '../features/community';
import { DEMO_PUBLIC_RECIPES } from '../features/community/demo-recipes';

export function CommunityPage() {
  const seed = useMemo(() => DEMO_PUBLIC_RECIPES as RecipeDetail[], []);
  return <CommunityScreen seedPublic={seed} />;
}
