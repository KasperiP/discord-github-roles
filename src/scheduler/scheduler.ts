import { Client } from 'discord.js';
import { createChildLogger, logError } from '../utils/logger';
import { RoleSyncService } from '../services/role-sync';

const log = createChildLogger('scheduler');

// Scheduling constants
const DEFAULT_SYNC_INTERVAL_HOURS = 0.25; // 15 minutes
const INITIAL_DELAY_MS = 5000; // Short delay before first sync to allow app initialization

export class Scheduler {
  private discordClient: Client;
  private roleSyncService: RoleSyncService;
  private syncIntervalMs: number;
  private syncInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private lastSyncTime = 0;

  constructor(discordClient: Client, syncIntervalHours?: number) {
    this.discordClient = discordClient;
    this.syncIntervalMs =
      (syncIntervalHours || DEFAULT_SYNC_INTERVAL_HOURS) * 60 * 60 * 1000;

    // Create role sync service with GitHub token if available
    this.roleSyncService = new RoleSyncService(discordClient);

    log.info(
      { syncIntervalHours: syncIntervalHours || DEFAULT_SYNC_INTERVAL_HOURS },
      'Scheduler initialized',
    );
  }

  /**
   * Start the scheduler
   */
  start() {
    if (this.syncInterval) {
      log.warn('Scheduler already running, not starting again');
      return;
    }

    log.info({ initialDelayMs: INITIAL_DELAY_MS }, 'Starting scheduler');

    // Schedule first sync after a short delay to allow the app to fully initialize
    setTimeout(() => {
      // Run the first sync
      this.runSync();

      // Then set up the regular interval
      this.syncInterval = setInterval(
        () => this.runSync(),
        this.syncIntervalMs,
      );

      log.info(
        { intervalMs: this.syncIntervalMs },
        'Regular sync interval established',
      );
    }, INITIAL_DELAY_MS);

    this.isRunning = true;
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      this.isRunning = false;
      log.info('Scheduler stopped');
    }
  }

  /**
   * Run a single sync operation
   */
  private async runSync() {
    // Don't run if the Discord client isn't ready
    if (!this.discordClient.isReady()) {
      log.warn('Discord client not ready, skipping this sync cycle');
      return;
    }

    // Ensure we don't have overlapping syncs
    const now = Date.now();
    if (now - this.lastSyncTime < this.syncIntervalMs * 0.9) {
      log.warn('Previous sync operation still too recent, skipping this cycle');
      return;
    }

    this.lastSyncTime = now;

    try {
      log.info(
        'Starting scheduled sync - will update roles based on current GitHub data',
      );
      const startTime = Date.now();

      // Run the sync process
      await this.roleSyncService.syncAllGuilds();

      const duration = Date.now() - startTime;
      log.info(
        { durationMs: duration },
        'Scheduled sync completed successfully - all role changes applied',
      );

      // If sync took longer than our interval, log a warning
      if (duration > this.syncIntervalMs) {
        log.warn(
          { durationMs: duration, intervalMs: this.syncIntervalMs },
          'Sync operation took longer than the configured interval',
        );
      }
    } catch (error) {
      logError(log, 'Error during scheduled sync', error);

      // We don't need to schedule another sync here since we're using setInterval
    }
  }

  /**
   * Manually trigger a sync operation
   */
  async triggerSync() {
    if (!this.isRunning) {
      log.warn('Scheduler not running, cannot trigger sync');
      return false;
    }

    log.info('Manual sync triggered');

    try {
      await this.runSync();
      return true;
    } catch (error) {
      logError(log, 'Error during manual sync', error);
      return false;
    }
  }
}
