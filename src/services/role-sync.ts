import { Client, GuildMember } from 'discord.js';
import { prisma } from '../index';
import { createChildLogger, logError } from '../utils/logger';
import { GitHubApiClient } from './github-api';
import { FollowedRepository, GuildConfig } from '@prisma/client';

const log = createChildLogger('role-sync');

export class RoleSyncService {
  private discordClient: Client;
  private githubClient: GitHubApiClient;

  constructor(discordClient: Client, githubToken?: string) {
    this.discordClient = discordClient;
    this.githubClient = new GitHubApiClient(githubToken);
  }

  /**
   * Sync GitHub roles for all guilds
   */
  async syncAllGuilds() {
    try {
      log.info('Starting sync for all guilds');

      // Get all configured guilds
      const guildConfigs = await prisma.guildConfig.findMany({
        where: {
          // Only get guilds with at least one role type configured and at least one repository
          OR: [
            { contributorRoleId: { not: null } },
            { stargazerRoleId: { not: null } },
          ],
          repositories: {
            some: {},
          },
        },
        include: {
          repositories: true,
        },
      });

      log.info({ count: guildConfigs.length }, 'Found guilds to sync');

      // Process each guild
      for (const guildConfig of guildConfigs) {
        try {
          await this.syncGuild(guildConfig);
        } catch (error) {
          logError(log, `Failed to sync guild ${guildConfig.guildId}`, error);
        }
      }

      log.info('Completed sync for all guilds');
    } catch (error) {
      logError(log, 'Error during global guild sync', error);
      throw error;
    }
  }

  /**
   * Sync GitHub roles for a specific guild
   */
  async syncGuild(
    guildConfig: GuildConfig & { repositories: FollowedRepository[] },
  ) {
    const guildLog = log.child({
      guildId: guildConfig.guildId,
      contributorRoleId: guildConfig.contributorRoleId,
      stargazerRoleId: guildConfig.stargazerRoleId,
      repositoryCount: guildConfig.repositories.length,
    });

    guildLog.info('Starting guild sync');

    // Create sync history record
    const syncHistory = await prisma.guildSyncHistory.create({
      data: {
        guildConfigId: guildConfig.id,
        startedAt: new Date(),
      },
    });

    let totalProcessed = 0;
    let rolesAdded = 0;
    let rolesRemoved = 0;

    try {
      // Get guild from Discord
      const guild = this.discordClient.guilds.cache.get(guildConfig.guildId);
      if (!guild) {
        throw new Error(`Guild not found in Discord: ${guildConfig.guildId}`);
      }

      // Check if the bot has necessary permissions
      const botMember = await guild.members.fetchMe();
      if (!botMember.permissions.has('ManageRoles')) {
        throw new Error(
          'Bot does not have "Manage Roles" permission in this guild',
        );
      }

      // Check if the bot can assign the configured roles
      if (guildConfig.contributorRoleId) {
        const contributorRole = guild.roles.cache.get(
          guildConfig.contributorRoleId,
        );
        if (!contributorRole) {
          guildLog.warn('Configured contributor role not found in guild');
        } else if (
          botMember.roles.highest.position <= contributorRole.position
        ) {
          guildLog.warn(
            'Bot cannot assign the contributor role (higher position)',
          );
        }
      }

      if (guildConfig.stargazerRoleId) {
        const stargazerRole = guild.roles.cache.get(
          guildConfig.stargazerRoleId,
        );
        if (!stargazerRole) {
          guildLog.warn('Configured stargazer role not found in guild');
        } else if (botMember.roles.highest.position <= stargazerRole.position) {
          guildLog.warn(
            'Bot cannot assign the stargazer role (higher position)',
          );
        }
      }

      // Get all Discord users with connected GitHub accounts
      const linkedUsers = await prisma.user.findMany({
        where: {
          discordAccount: {
            isNot: null,
          },
          gitHubAccount: {
            isNot: null,
          },
        },
        include: {
          discordAccount: true,
          gitHubAccount: true,
        },
      });

      guildLog.info(
        { count: linkedUsers.length },
        'Found linked Discord-GitHub accounts',
      );

      // Fetch all repositories data once to avoid repeated API calls
      const repoDataMap = new Map();

      // Process all repositories and gather data
      for (const repo of guildConfig.repositories) {
        try {
          const repoFullName = `${repo.owner}/${repo.name}`;

          // Get repository sync state
          let syncState = await prisma.repositorySyncState.findUnique({
            where: { repositoryFullName: repoFullName },
          });

          // Create the repository sync state record if it doesn't exist
          if (!syncState) {
            syncState = await prisma.repositorySyncState.create({
              data: {
                repositoryFullName: repoFullName,
              },
            });
          }

          // Get contributors
          let contributors: string[] | null = [];
          let contributorEtag: string | null = syncState.contributorEtag;

          if (guildConfig.contributorRoleId) {
            const {
              contributors: repoContributors,
              etag: newEtag,
              notModified,
            } = await this.githubClient.getRepositoryContributors(
              repo.owner,
              repo.name,
              syncState.contributorEtag || undefined,
            );

            // If data hasn't changed, need to get the cached data from database
            if (notModified) {
              // Fetch previously synced contributors from database
              const cachedRepo = await prisma.repositorySyncState.findUnique({
                where: { repositoryFullName: repoFullName },
                include: { cachedContributors: true },
              });

              // Use cached contributors if available
              contributors =
                cachedRepo?.cachedContributors.map((c) => c.username) || [];
              guildLog.info(
                { repo: repoFullName, count: contributors.length },
                'Using cached contributors data (not modified since last sync)',
              );
            } else {
              contributors = repoContributors || [];

              // Update cached contributors in database
              if (contributors.length > 0) {
                // First delete existing cached contributors
                await prisma.contributorCache.deleteMany({
                  where: { repositoryFullName: repoFullName },
                });

                // Then create new ones
                for (const username of contributors) {
                  await prisma.contributorCache.create({
                    data: {
                      username,
                      repositoryFullName: repoFullName,
                    },
                  });
                }
              }
            }
            contributorEtag = newEtag || null;
          }

          // Get stargazers
          let stargazers: string[] | null = [];
          let stargazerEtag: string | null = syncState.stargazerEtag;

          if (guildConfig.stargazerRoleId) {
            const {
              stargazers: repoStargazers,
              etag: newEtag,
              notModified,
            } = await this.githubClient.getRepositoryStargazers(
              repo.owner,
              repo.name,
              syncState.stargazerEtag || undefined,
            );

            // If data hasn't changed, need to get the cached data from database
            if (notModified) {
              // Fetch previously synced stargazers from database
              const cachedRepo = await prisma.repositorySyncState.findUnique({
                where: { repositoryFullName: repoFullName },
                include: { cachedStargazers: true },
              });

              // Use cached stargazers if available
              stargazers =
                cachedRepo?.cachedStargazers.map((s) => s.username) || [];
              guildLog.info(
                { repo: repoFullName, count: stargazers.length },
                'Using cached stargazers data (not modified since last sync)',
              );
            } else {
              stargazers = repoStargazers || [];

              // Update cached stargazers in database
              if (stargazers.length > 0) {
                // First delete existing cached stargazers
                await prisma.stargazerCache.deleteMany({
                  where: { repositoryFullName: repoFullName },
                });

                // Then create new ones
                for (const username of stargazers) {
                  await prisma.stargazerCache.create({
                    data: {
                      username,
                      repositoryFullName: repoFullName,
                    },
                  });
                }
              }
            }
            stargazerEtag = newEtag || null;
          }

          // Store the data
          repoDataMap.set(repoFullName, { contributors, stargazers });

          // Update sync state
          await prisma.repositorySyncState.update({
            where: { repositoryFullName: repoFullName },
            data: {
              lastContributorSync: contributors ? new Date() : undefined,
              lastStargazerSync: stargazers ? new Date() : undefined,
              contributorEtag,
              stargazerEtag,
              lastSyncError: null,
            },
          });
        } catch (error) {
          logError(
            guildLog,
            `Error fetching data for repo ${repo.owner}/${repo.name}`,
            error,
          );

          // Update sync state with error
          await prisma.repositorySyncState.upsert({
            where: { repositoryFullName: `${repo.owner}/${repo.name}` },
            update: {
              lastSyncError:
                error instanceof Error ? error.message : String(error),
            },
            create: {
              repositoryFullName: `${repo.owner}/${repo.name}`,
              lastSyncError:
                error instanceof Error ? error.message : String(error),
            },
          });
        }
      }

      // Process each linked user
      for (const user of linkedUsers) {
        try {
          // Skip if GitHub or Discord account is null
          if (!user.discordAccount || !user.gitHubAccount) {
            continue;
          }

          // Try to get the guild member
          const member = await guild.members
            .fetch(user.discordAccount.discordId)
            .catch(() => null);

          if (!member) continue; // User not in this guild

          totalProcessed++;

          // Process contributor role
          if (guildConfig.contributorRoleId) {
            const { added, removed } = await this.processContributorRole(
              member,
              user.gitHubAccount.username,
              guildConfig,
              repoDataMap,
            );

            rolesAdded += added;
            rolesRemoved += removed;
          }

          // Process stargazer role
          if (guildConfig.stargazerRoleId) {
            const { added, removed } = await this.processStargazerRole(
              member,
              user.gitHubAccount.username,
              guildConfig,
              repoDataMap,
            );

            rolesAdded += added;
            rolesRemoved += removed;
          }
        } catch (error) {
          logError(guildLog, `Error processing user ${user.id}`, error);
        }
      }

      // Update sync history as successful
      await prisma.guildSyncHistory.update({
        where: { id: syncHistory.id },
        data: {
          completedAt: new Date(),
          success: true,
          totalProcessed,
          rolesAdded,
          rolesRemoved,
        },
      });

      guildLog.info(
        {
          totalProcessed,
          rolesAdded,
          rolesRemoved,
        },
        'Guild sync completed successfully',
      );
    } catch (error) {
      logError(guildLog, 'Error during guild sync', error);

      // Update sync history with error
      await prisma.guildSyncHistory.update({
        where: { id: syncHistory.id },
        data: {
          completedAt: new Date(),
          success: false,
          errorMessage: error instanceof Error ? error.message : String(error),
          totalProcessed,
          rolesAdded,
          rolesRemoved,
        },
      });
    }
  }

  /**
   * Process contributor role for a user
   */
  private async processContributorRole(
    member: GuildMember,
    githubUsername: string,
    guildConfig: GuildConfig & { repositories: FollowedRepository[] },
    repoDataMap: Map<
      string,
      { contributors: string[] | null; stargazers: string[] | null }
    >,
  ): Promise<{ added: number; removed: number }> {
    let added = 0;
    let removed = 0;

    // Early return if no contributor role is configured
    if (!guildConfig.contributorRoleId) {
      return { added, removed };
    }

    // Normalize GitHub username to lowercase for comparisons
    const normalizedUsername = githubUsername.toLowerCase();

    // Detect if user is a contributor to any followed repository
    const isContributor = guildConfig.repositories.some((repo) => {
      const repoData = repoDataMap.get(`${repo.owner}/${repo.name}`);
      return repoData?.contributors?.includes(normalizedUsername);
    });

    // Get the role
    const contributorRole = member.guild.roles.cache.get(
      guildConfig.contributorRoleId,
    );
    if (!contributorRole) return { added, removed };

    const hasRole = member.roles.cache.has(contributorRole.id);

    // Add role if needed
    if (isContributor && !hasRole) {
      try {
        await member.roles.add(contributorRole, 'GitHub contributor role sync');
        added = 1;
      } catch (error) {
        logError(
          log,
          `Failed to add contributor role to ${member.user.tag}`,
          error,
        );
      }
    }
    // Remove role if needed
    else if (!isContributor && hasRole) {
      try {
        await member.roles.remove(
          contributorRole,
          'GitHub contributor role sync',
        );
        removed = 1;
      } catch (error) {
        logError(
          log,
          `Failed to remove contributor role from ${member.user.tag}`,
          error,
        );
      }
    }

    return { added, removed };
  }

  /**
   * Process stargazer role for a user
   */
  private async processStargazerRole(
    member: GuildMember,
    githubUsername: string,
    guildConfig: GuildConfig & { repositories: FollowedRepository[] },
    repoDataMap: Map<
      string,
      { contributors: string[] | null; stargazers: string[] | null }
    >,
  ): Promise<{ added: number; removed: number }> {
    let added = 0;
    let removed = 0;

    // Early return if no stargazer role is configured
    if (!guildConfig.stargazerRoleId) {
      return { added, removed };
    }

    // Normalize GitHub username to lowercase for comparisons
    const normalizedUsername = githubUsername.toLowerCase();

    // Detect if user is a stargazer of any followed repository
    const isStargazer = guildConfig.repositories.some((repo) => {
      const repoData = repoDataMap.get(`${repo.owner}/${repo.name}`);
      return repoData?.stargazers?.includes(normalizedUsername);
    });

    // Get the role
    const stargazerRole = member.guild.roles.cache.get(
      guildConfig.stargazerRoleId,
    );
    if (!stargazerRole) return { added, removed };

    const hasRole = member.roles.cache.has(stargazerRole.id);

    // Add role if needed
    if (isStargazer && !hasRole) {
      try {
        log.debug(
          { user: member.user.tag, githubUsername },
          'Adding stargazer role - user stars at least one repository',
        );
        await member.roles.add(stargazerRole, 'GitHub stargazer role sync');
        added = 1;
      } catch (error) {
        logError(
          log,
          `Failed to add stargazer role to ${member.user.tag}`,
          error,
        );
      }
    }
    // Remove role if needed
    else if (!isStargazer && hasRole) {
      try {
        log.debug(
          { user: member.user.tag, githubUsername },
          'Removing stargazer role - user no longer stars any repositories',
        );
        await member.roles.remove(stargazerRole, 'GitHub stargazer role sync');
        removed = 1;
      } catch (error) {
        logError(
          log,
          `Failed to remove stargazer role from ${member.user.tag}`,
          error,
        );
      }
    }

    return { added, removed };
  }
}
