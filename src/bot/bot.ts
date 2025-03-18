import {
  Client,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChatInputCommandInteraction,
  MessageFlags,
} from 'discord.js';
import { prisma } from '../index';
import { createChildLogger, logError } from '../utils/logger';

const log = createChildLogger('bot');

// Define command builders
const commands = [
  new SlashCommandBuilder()
    .setName('setup-contributor-role')
    .setDescription('Set up a role for GitHub repository contributors')
    .addRoleOption((option) =>
      option
        .setName('role')
        .setDescription('The role to assign to contributors')
        .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('remove-contributor-role')
    .setDescription('Remove the configured contributor role')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('setup-stargazer-role')
    .setDescription('Set up a role for GitHub repository stargazers')
    .addRoleOption((option) =>
      option
        .setName('role')
        .setDescription('The role to assign to stargazers')
        .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('remove-stargazer-role')
    .setDescription('Remove the configured stargazer role')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('show-config')
    .setDescription('Show current role configuration for this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('follow-repository')
    .setDescription('Add a GitHub repository to follow for role assignments')
    .addStringOption((option) =>
      option
        .setName('owner')
        .setDescription(
          'GitHub username or organization that owns the repository',
        )
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('Repository name')
        .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('unfollow-repository')
    .setDescription('Remove a GitHub repository from being followed')
    .addStringOption((option) =>
      option
        .setName('owner')
        .setDescription(
          'GitHub username or organization that owns the repository',
        )
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('Repository name')
        .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('list-repositories')
    .setDescription('List all followed GitHub repositories')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
];

export function createBot(token: string) {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  // Register commands when bot is ready
  client.once(Events.ClientReady, async (readyClient) => {
    log.info(
      { username: readyClient.user.tag },
      `Ready! Logged in as ${readyClient.user.tag}`,
    );

    // Register slash commands with Discord API
    const rest = new REST({ version: '10' }).setToken(token);

    try {
      log.info('Started refreshing application (/) commands.');

      await rest.put(Routes.applicationCommands(readyClient.user.id), {
        body: commands,
      });

      log.info('Successfully reloaded application (/) commands.');
    } catch (error) {
      logError(log, 'Error refreshing application commands', error, {
        userId: readyClient.user.id,
      });
    }
  });

  // Error handler for client
  client.on('error', (error) => {
    logError(log, 'Discord client error occurred', error);
  });

  // Handle interaction events (commands)
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, user, guildId } = interaction;
    const startTime = Date.now();
    const commandLog = log.child({
      command: commandName,
      userId: user.id,
      guildId,
    });

    commandLog.info('Command received');

    // Verify that the command is being used in a guild (server)
    if (!interaction.guild) {
      await interaction.reply({
        content: 'This command can only be used in a server.',
        flags: MessageFlags.Ephemeral,
      });
      commandLog.warn('Command used outside of guild');
      return;
    }

    // Verify that the user has administrator permissions
    if (
      !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
    ) {
      await interaction.reply({
        content: 'You need administrator permissions to use this command.',
        flags: MessageFlags.Ephemeral,
      });
      commandLog.warn('Command used without required permissions');
      return;
    }

    try {
      switch (commandName) {
        case 'setup-contributor-role':
          await setupContributorRole(interaction);
          break;
        case 'remove-contributor-role':
          await removeContributorRole(interaction);
          break;
        case 'setup-stargazer-role':
          await setupStargazerRole(interaction);
          break;
        case 'remove-stargazer-role':
          await removeStargazerRole(interaction);
          break;
        case 'show-config':
          await showConfig(interaction);
          break;
        case 'follow-repository':
          await followRepository(interaction);
          break;
        case 'unfollow-repository':
          await unfollowRepository(interaction);
          break;
        case 'list-repositories':
          await listRepositories(interaction);
          break;
        default:
          commandLog.warn('Unknown command received');
          await interaction.reply({
            content: 'Unknown command. Please try again or contact support.',
            flags: MessageFlags.Ephemeral,
          });
      }

      const executionTime = Date.now() - startTime;
      commandLog.info(
        { executionTimeMs: executionTime },
        'Command executed successfully',
      );
    } catch (error) {
      const errorId = Math.random().toString(36).substring(2, 10);
      logError(commandLog, `Error handling command ${commandName}`, error, {
        errorId,
      });

      // Make sure the interaction hasn't been replied to already
      if (interaction.replied || interaction.deferred) {
        try {
          await interaction.followUp({
            content: `An error occurred while processing your command. Error reference: ${errorId}`,
            flags: MessageFlags.Ephemeral,
          });
        } catch (followUpError) {
          logError(commandLog, 'Failed to send error followUp', followUpError, {
            originalErrorId: errorId,
          });
        }
      } else {
        try {
          await interaction.reply({
            content: `An error occurred while processing your command. Error reference: ${errorId}`,
            flags: MessageFlags.Ephemeral,
          });
        } catch (replyError) {
          logError(commandLog, 'Failed to send error reply', replyError, {
            originalErrorId: errorId,
          });
        }
      }
    }
  });

  // Add login error handling
  client.login(token).catch((error) => {
    logError(log, 'Failed to login to Discord', error);
    process.exit(1); // Exit the process on login failure
  });

  return client;
}

// Command handler functions
async function setupContributorRole(interaction: ChatInputCommandInteraction) {
  const role = interaction.options.getRole('role');

  if (!role) {
    await interaction.reply({
      content: 'Please provide a valid role.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!interaction.guild) {
    await interaction.reply({
      content: 'This command can only be used in a server.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await prisma.guildConfig.upsert({
    where: { guildId: interaction.guild?.id },
    update: {
      contributorRoleId: role.id,
      updatedAt: new Date(),
    },
    create: {
      guildId: interaction.guild?.id,
      contributorRoleId: role.id,
    },
  });

  await interaction.reply({
    content: `Successfully set ${role.name} as the contributor role.`,
    flags: MessageFlags.Ephemeral,
  });
}

async function removeContributorRole(interaction: ChatInputCommandInteraction) {
  const config = await prisma.guildConfig.findUnique({
    where: { guildId: interaction.guild?.id },
  });

  if (!config || !config.contributorRoleId) {
    await interaction.reply({
      content: 'No contributor role is currently configured.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await prisma.guildConfig.update({
    where: { guildId: interaction.guild?.id },
    data: {
      contributorRoleId: null,
      updatedAt: new Date(),
    },
  });

  await interaction.reply({
    content: 'The contributor role has been removed from configuration.',
    flags: MessageFlags.Ephemeral,
  });
}

async function setupStargazerRole(interaction: ChatInputCommandInteraction) {
  const role = interaction.options.getRole('role');

  if (!role) {
    await interaction.reply({
      content: 'Please provide a valid role.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!interaction.guild) {
    await interaction.reply({
      content: 'This command can only be used in a server.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await prisma.guildConfig.upsert({
    where: { guildId: interaction.guild?.id },
    update: {
      stargazerRoleId: role.id,
      updatedAt: new Date(),
    },
    create: {
      guildId: interaction.guild?.id,
      stargazerRoleId: role.id,
    },
  });

  await interaction.reply({
    content: `Successfully set ${role.name} as the stargazer role.`,
    flags: MessageFlags.Ephemeral,
  });
}

async function removeStargazerRole(interaction: ChatInputCommandInteraction) {
  const config = await prisma.guildConfig.findUnique({
    where: { guildId: interaction.guild?.id },
  });

  if (!config || !config.stargazerRoleId) {
    await interaction.reply({
      content: 'No stargazer role is currently configured.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await prisma.guildConfig.update({
    where: { guildId: interaction.guild?.id },
    data: {
      stargazerRoleId: null,
      updatedAt: new Date(),
    },
  });

  await interaction.reply({
    content: 'The stargazer role has been removed from configuration.',
    flags: MessageFlags.Ephemeral,
  });
}

async function showConfig(interaction: ChatInputCommandInteraction) {
  const config = await prisma.guildConfig.findUnique({
    where: { guildId: interaction.guild?.id },
    include: {
      repositories: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!config) {
    await interaction.reply({
      content: 'No configuration found for this server.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  let responseMessage = 'Current configuration:\n';

  if (config.contributorRoleId) {
    const contributorRole = interaction.guild?.roles.cache.get(
      config.contributorRoleId,
    );
    responseMessage += `• Contributor Role: ${contributorRole ? contributorRole.name : 'Unknown Role'} (ID: ${config.contributorRoleId})\n`;
  } else {
    responseMessage += '• Contributor Role: Not configured\n';
  }

  if (config.stargazerRoleId) {
    const stargazerRole = interaction.guild?.roles.cache.get(
      config.stargazerRoleId,
    );
    responseMessage += `• Stargazer Role: ${stargazerRole ? stargazerRole.name : 'Unknown Role'} (ID: ${config.stargazerRoleId})\n`;
  } else {
    responseMessage += '• Stargazer Role: Not configured\n';
  }

  // Add repository count
  responseMessage += `• Followed Repositories: ${config.repositories.length} (use /list-repositories to see details)`;

  await interaction.reply({
    content: responseMessage,
    flags: MessageFlags.Ephemeral,
  });
}

// Add error handling wrapper for database operations
async function performDatabaseOperation<T>(
  operation: () => Promise<T>,
  errorMessage: string,
  context: Record<string, unknown> = {},
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const dbLog = log.child(context);
    logError(dbLog, errorMessage, error);
    throw new Error(
      `${errorMessage}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// Update each command handler with improved error handling - here's an example for followRepository:
async function followRepository(interaction: ChatInputCommandInteraction) {
  const owner = interaction.options.getString('owner', true);
  const name = interaction.options.getString('name', true);
  const guildId = interaction.guild?.id;
  const userId = interaction.user.id;

  const repoLog = log.child({
    command: 'follow-repository',
    owner,
    name,
    guildId,
    userId,
  });

  if (!owner || !name) {
    await interaction.reply({
      content: 'Please provide both repository owner and name.',
      flags: MessageFlags.Ephemeral,
    });
    repoLog.warn('Missing repository parameters');
    return;
  }

  // Validate repository format (simple check)
  if (!/^[a-zA-Z0-9_.-]+$/.test(owner) || !/^[a-zA-Z0-9_.-]+$/.test(name)) {
    await interaction.reply({
      content: 'Invalid repository owner or name format.',
      flags: MessageFlags.Ephemeral,
    });
    repoLog.warn('Invalid repository format');
    return;
  }

  try {
    if (!guildId) {
      await interaction.reply({
        content: 'This command can only be used in a server.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Show a "thinking" state while processing
    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    // Create or get guild config
    const guildConfig = await performDatabaseOperation(
      () =>
        prisma.guildConfig.upsert({
          where: { guildId: guildId },
          update: {
            updatedAt: new Date(),
          },
          create: {
            guildId: guildId,
          },
        }),
      'Failed to create or update guild config',
      { command: 'follow-repository', guildId },
    );

    // Check if repository is already being followed
    const existingRepo = await performDatabaseOperation(
      () =>
        prisma.followedRepository.findFirst({
          where: {
            guildConfigId: guildConfig.id,
            owner: {
              equals: owner.toLowerCase(),
            },
            name: {
              equals: name.toLowerCase(),
            },
          },
        }),
      'Failed to check if repository exists',
      { owner, name, guildId },
    );

    if (existingRepo) {
      await interaction.editReply({
        content: `Repository ${owner}/${name} is already being followed.`,
      });
      return;
    }

    // Try to validate if repository exists
    try {
      const repoCheckResponse = await fetch(
        `https://api.github.com/repos/${owner}/${name}`,
        {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'discord-github-roles',
          },
        },
      );

      if (!repoCheckResponse.ok) {
        const errorData = await repoCheckResponse.json().catch(() => ({}));
        log.warn('GitHub API reported repository does not exist', {
          owner,
          name,
          statusCode: repoCheckResponse.status,
          response: errorData,
        });

        await interaction.editReply({
          content: `Repository ${owner}/${name} doesn't seem to exist or is not accessible. Please check the name and try again.`,
        });
        return;
      }
    } catch (fetchError) {
      log.error('Failed to fetch repository from GitHub API', {
        owner,
        name,
        error:
          fetchError instanceof Error
            ? { message: fetchError.message, stack: fetchError.stack }
            : String(fetchError),
      });

      await interaction.editReply({
        content: `Unable to verify repository ${owner}/${name}. GitHub API may be unavailable. Please try again later.`,
      });
      return;
    }

    // Add repository to followed list
    await performDatabaseOperation(
      () =>
        prisma.followedRepository.create({
          data: {
            owner: owner.toLowerCase(),
            name: name.toLowerCase(),
            guildConfigId: guildConfig.id,
          },
        }),
      'Failed to add repository to database',
      { owner, name, guildId },
    );

    repoLog.info('New repository followed');
    await interaction.editReply({
      content: `Now following GitHub repository: ${owner}/${name}`,
    });
  } catch (error) {
    logError(repoLog, 'Error following repository', error);

    // Make sure we reply to the user
    if (interaction.deferred) {
      await interaction
        .editReply({
          content: `Failed to follow repository ${owner}/${name}. Please try again later.`,
        })
        .catch((e) => {
          log.error('Failed to edit reply with error message', {
            originalError:
              error instanceof Error ? error.message : String(error),
            replyError: e instanceof Error ? e.message : String(e),
          });
        });
    } else {
      await interaction
        .reply({
          content: `Failed to follow repository ${owner}/${name}. Please try again later.`,
          flags: MessageFlags.Ephemeral,
        })
        .catch((e) => {
          log.error('Failed to reply with error message', {
            originalError:
              error instanceof Error ? error.message : String(error),
            replyError: e instanceof Error ? e.message : String(e),
          });
        });
    }
  }
}

async function unfollowRepository(interaction: ChatInputCommandInteraction) {
  const owner = interaction.options.getString('owner', true);
  const name = interaction.options.getString('name', true);

  if (!owner || !name) {
    await interaction.reply({
      content: 'Please provide both repository owner and name.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    // Find the guild config
    const guildConfig = await prisma.guildConfig.findUnique({
      where: { guildId: interaction.guild?.id },
    });

    if (!guildConfig) {
      await interaction.reply({
        content: 'No configuration found for this server.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Find and delete the repository
    const deletedRepo = await prisma.followedRepository.deleteMany({
      where: {
        guildConfigId: guildConfig.id,
        owner: {
          equals: owner.toLowerCase(),
        },
        name: {
          equals: name.toLowerCase(),
        },
      },
    });

    if (deletedRepo.count > 0) {
      await interaction.reply({
        content: `Stopped following GitHub repository: ${owner}/${name}`,
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await interaction.reply({
        content: `Repository ${owner}/${name} was not being followed.`,
        flags: MessageFlags.Ephemeral,
      });
    }
  } catch (error) {
    console.error('Error unfollowing repository:', error);
    await interaction.reply({
      content: `Failed to unfollow repository ${owner}/${name}. Please try again later.`,
      flags: MessageFlags.Ephemeral,
    });
  }
}

async function listRepositories(interaction: ChatInputCommandInteraction) {
  try {
    // Find the guild config with repositories
    const guildConfig = await prisma.guildConfig.findUnique({
      where: { guildId: interaction.guild?.id },
      include: {
        repositories: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    if (!guildConfig || guildConfig.repositories.length === 0) {
      await interaction.reply({
        content: 'No repositories are currently being followed in this server.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const repoList = guildConfig.repositories
      .map((repo, index) => `${index + 1}. ${repo.owner}/${repo.name}`)
      .join('\n');

    await interaction.reply({
      content: `**Followed GitHub Repositories:**\n${repoList}`,
      flags: MessageFlags.Ephemeral,
    });
  } catch (error) {
    console.error('Error listing repositories:', error);
    await interaction.reply({
      content: 'Failed to list repositories. Please try again later.',
      flags: MessageFlags.Ephemeral,
    });
  }
}
