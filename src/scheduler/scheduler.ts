import { Client } from 'discord.js';
import { createChildLogger, logError } from '../utils/logger';
import { RoleSyncService } from '../services/role-sync';
import { config } from '../config/config';

const log = createChildLogger('scheduler');

// Scheduling constants
const DEFAULT_SYNC_INTERVAL_HOURS = 0.25; // 15 minutes
const INITIAL_DELAY_MS = 0; // Start immediately
const SYNC_ERROR_RETRY_MS = 1000 * 60 * 30; // 30 minutes on error

export class Scheduler {
  private discordClient: Client;
  private roleSyncService: RoleSyncService;
  private syncIntervalMs: number;
  private syncTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(discordClient: Client, syncIntervalHours?: number) {
    this.discordClient = discordClient;
    this.syncIntervalMs =
      (syncIntervalHours || DEFAULT_SYNC_INTERVAL_HOURS) * 60 * 60 * 1000;

    // Create role sync service with GitHub token if available
    this.roleSyncService = new RoleSyncService(
      discordClient,
      config.github.syncToken,
    );

    log.info(
      { syncIntervalHours: syncIntervalHours || DEFAULT_SYNC_INTERVAL_HOURS },
      'Scheduler initialized',
    );
  }

  /**
   * Start the scheduler
   */
  start() {
    if (this.syncTimer) {
      log.warn('Scheduler already running, not starting again');
      return;
    }

    log.info({ initialDelayMs: INITIAL_DELAY_MS }, 'Starting scheduler');

    // Schedule first sync after a short delay to allow the app to fully initialize
    this.syncTimer = setTimeout(() => this.runSync(), INITIAL_DELAY_MS);
    this.isRunning = true;
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
      this.isRunning = false;
      log.info('Scheduler stopped');
    }
  }

  /**
   * Run a single sync operation
   */
  private async runSync() {
    // Clear the existing timer
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }

    // Don't run if the Discord client isn't ready
    if (!this.discordClient.isReady()) {
      log.warn('Discord client not ready, rescheduling sync');
      this.syncTimer = setTimeout(() => this.runSync(), 60000); // Try again in 1 minute
      return;
    }

    try {
      log.info('Starting scheduled sync');
      const startTime = Date.now();

      // Run the sync process
      await this.roleSyncService.syncAllGuilds();

      const duration = Date.now() - startTime;
      log.info(
        { durationMs: duration },
        'Scheduled sync completed successfully',
      );

      // Schedule next sync
      this.syncTimer = setTimeout(() => this.runSync(), this.syncIntervalMs);
    } catch (error) {
      logError(log, 'Error during scheduled sync', error);

      // Schedule retry sooner than the normal interval
      this.syncTimer = setTimeout(() => this.runSync(), SYNC_ERROR_RETRY_MS);
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
