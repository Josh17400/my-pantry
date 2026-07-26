/**
 * Holds the active PantryRepository for Zustand stores.
 * Wired once at app boot (native initialize); tests inject NodeSqliteRepository.
 */

import type { DomainRepository } from '../db/domain-repository';
import type { PantryRepository } from '../db/repository';
import { NotConfiguredError } from '../db/repository';

let activeRepo: PantryRepository | null = null;

export function setActiveRepository(repo: PantryRepository | null): void {
  activeRepo = repo;
}

export function getActiveRepository(): PantryRepository {
  if (!activeRepo) {
    throw new NotConfiguredError(
      'No active data repository. Call setActiveRepository() after initialize().',
    );
  }
  return activeRepo;
}

export function getDomainRepository(): DomainRepository {
  const repo = getActiveRepository();
  if (!repo.domain) {
    throw new NotConfiguredError('Repository does not expose domain()');
  }
  return repo.domain();
}

export function hasActiveRepository(): boolean {
  return activeRepo !== null;
}
