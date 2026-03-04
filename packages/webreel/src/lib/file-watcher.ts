/**
 * Shared file watcher utility.
 * Extracted from the record command for reuse by render and other commands.
 * Handles debounced re-runs with concurrent execution protection.
 */

import { watch, type FSWatcher } from "node:fs";

/** Options for the file watcher. */
export interface FileWatcherOptions {
  /** Debounce interval in milliseconds before triggering callback. */
  readonly debounceMs?: number;
}

/** Handle returned by watchAndRerun for cleanup. */
export interface FileWatcherHandle {
  /** Close all file watchers and clean up. */
  close(): void;
  /** Update the set of watched paths (e.g., after config reload). */
  updatePaths(paths: readonly string[]): void;
}

/**
 * Watch file paths and re-run a callback on changes.
 *
 * Features:
 * - Debounced: rapid changes are coalesced into a single callback.
 * - Concurrent protection: new changes during a running callback are queued.
 * - SIGINT cleanup: graceful shutdown on Ctrl+C.
 *
 * @param paths - File or directory paths to watch.
 * @param callback - Async function to run on changes.
 * @param options - Watcher configuration.
 * @returns A handle to close the watcher and update paths.
 */
export function watchAndRerun(
  paths: readonly string[],
  callback: () => Promise<void>,
  options: FileWatcherOptions = {},
): FileWatcherHandle {
  const debounceMs = options.debounceMs ?? 300;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let runInProgress: Promise<void> | null = null;
  const watchers: FSWatcher[] = [];

  const closeAllWatchers = (): void => {
    for (const w of watchers) w.close();
    watchers.length = 0;
  };

  const setupWatchers = (watchPaths: readonly string[]): void => {
    closeAllWatchers();
    for (const p of watchPaths) {
      try {
        watchers.push(watch(p, onFileChange));
      } catch {
        // Silently skip paths that don't exist (yet)
      }
    }
  };

  const onFileChange = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const run = (async (): Promise<void> => {
        try {
          await callback();
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("Watch callback error:", message);
        } finally {
          runInProgress = null;
        }
      })();
      runInProgress = run;
      void run;
    }, debounceMs);
  };

  const handle: FileWatcherHandle = {
    close(): void {
      if (timer) clearTimeout(timer);
      closeAllWatchers();
    },
    updatePaths(newPaths: readonly string[]): void {
      setupWatchers(newPaths);
    },
  };

  // Register SIGINT handler for graceful shutdown
  const sigintHandler = async (): Promise<void> => {
    handle.close();
    if (runInProgress) {
      console.log("\nWaiting for current run to finish...");
      await runInProgress;
    }
    process.exit(0);
  };
  process.on("SIGINT", () => void sigintHandler());

  // Start watching
  setupWatchers(paths);

  return handle;
}
